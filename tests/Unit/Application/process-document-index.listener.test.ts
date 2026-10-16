import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  createDocumentFixture,
  createRepositoryStub,
  createJobRecordFixture,
  createRestoredDocumentIndexFixture,
  createRestoredMembershipFixture,
} from './document-index-lifecycle.fixture.ts'
import type { ReplaceIndexChunkInputDto } from '../../../src/Application/Chunks/DataTransferObjects/replace-index-chunk-input.dto.ts'
import type { DocumentIndexExecutionQueue } from '../../../src/Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import type { DocumentIndexRepository } from '../../../src/Application/DocumentIndexes/Contracts/document-index.repository.ts'
import type { DocumentIndexExecutionLeaseDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-index-execution-lease.dto.ts'
import { type DocumentIndexingClaimDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-indexing-claim.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/Application/DocumentIndexes/Enums/document-index-execution-stage.enum.ts'
import type { DocumentIndexedEvent } from '../../../src/Application/DocumentIndexes/Events/document-indexed.event.ts'
import { DocumentIndexingDispatchedEvent } from '../../../src/Application/DocumentIndexes/Events/document-indexing-dispatched.event.ts'
import type { DocumentIndexingFailedEvent } from '../../../src/Application/DocumentIndexes/Events/document-indexing-failed.event.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { ProcessDocumentIndexListener } from '../../../src/Application/DocumentIndexes/Listeners/process-document-index.listener.ts'
import type {
  DocumentIndexExecutionIdQueryObject,
  RenewDocumentIndexExecutionLeaseQueryObject,
} from '../../../src/Application/DocumentIndexes/QueryObjects/document-index-execution.query-object.ts'
import type { DocumentRepository } from '../../../src/Application/Documents/Contracts/document.repository.ts'
import type { DocumentIdQueryObject } from '../../../src/Application/Documents/QueryObjects/document.query-object.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import type { PersistenceTransaction } from '../../../src/Application/KnowledgeBases/Contracts/persistence-transaction.ts'
import type { MembershipRepository } from '../../../src/Application/Memberships/Contracts/membership.repository.ts'
import type { MembershipSourceQueryObject } from '../../../src/Application/Memberships/QueryObjects/membership.query-object.ts'
import { ReserveMembershipForIndexingUseCase } from '../../../src/Application/Memberships/UseCases/reserve-membership-for-indexing.use-case.ts'
import { DocumentRevision } from '../../../src/Domain/DocumentRevision/document-revision.ts'
import { createMarkdownChunkPlan } from '../../Support/markdown-chunk-plan.fixture.ts'

const createClaimedJobFixture: DocumentIndexingClaimDto = {
  id: 'job',
  knowledgeBaseId: 'kb',
  documentId: 'document',
  documentIndexId: 'index',
  generation: '1',
  attempts: 1,
  leaseToken: 'lease-token',
  leaseExpiresAt: new Date(Date.now() + 120),
  executionVerification: {
    stage: DocumentIndexExecutionStageEnum.CLAIMED,
    completedUnits: 0,
    totalUnits: null,
    verifiedAt: null,
  },
}

const createDeferredJobPromise = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

const createProcessJobScenario = (
  options: {
    blockLoading?: boolean
    failRenewal?: boolean
    leaseFact?: Partial<DocumentIndexExecutionLeaseDto>
    requestedGeneration?: string
    expireDuringParentLock?: boolean
  } = {},
) => {
  const currentJob: DocumentIndexingClaimDto = {
    ...createClaimedJobFixture,
    leaseExpiresAt: new Date(Date.now() + 120),
  }
  const renewalObserved = createDeferredJobPromise<void>()
  const loadingStarted = createDeferredJobPromise<void>()
  const loadingResult = createDeferredJobPromise<string>()
  const embeddingResult = createDeferredJobPromise<number[][]>()
  const failed: unknown[] = []
  const savedPlans: {
    vectors: readonly number[][]
    contents: readonly string[]
  }[] = []
  let heartbeatCount = 0
  let completeCount = 0
  const lockOrder: string[] = []
  const leaseFact: DocumentIndexExecutionLeaseDto = {
    id: createClaimedJobFixture.id,
    knowledgeBaseId: createClaimedJobFixture.knowledgeBaseId,
    documentId: createClaimedJobFixture.documentId,
    documentIndexId: createClaimedJobFixture.documentIndexId,
    generation: createClaimedJobFixture.generation,
    attempts: createClaimedJobFixture.attempts,
    status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    leaseToken: createClaimedJobFixture.leaseToken,
    leaseExpiresAt: currentJob.leaseExpiresAt,
    ...options.leaseFact,
  }

  let activeTransactions = 0
  const persistenceTransaction: PersistenceTransaction = {
    runReadOnlySnapshot: async () => assert.fail('processing uses write transactions'),
    run: async <T>(operation: () => Promise<T>): Promise<T> => {
      activeTransactions += 1
      try {
        return await operation()
      } finally {
        activeTransactions -= 1
      }
    },
  }
  const documentRepository = {
    lockByDocumentId: async (documentIdQO: DocumentIdQueryObject) => {
      assert.ok(activeTransactions > 0)
      assert.deepEqual(documentIdQO, { documentId: currentJob.documentId })
      lockOrder.push('document')

      return createDocumentFixture({ id: currentJob.documentId })
    },
  } as DocumentRepository
  const membershipRepository = {
    lockByKnowledgeBaseIdAndDocumentId: async (membershipSourceQO: MembershipSourceQueryObject) => {
      assert.ok(activeTransactions > 0)
      assert.deepEqual(membershipSourceQO, {
        knowledgeBaseId: currentJob.knowledgeBaseId,
        documentId: currentJob.documentId,
      })
      lockOrder.push('membership')

      if (options.expireDuringParentLock) leaseFact.leaseExpiresAt = new Date(Date.now() - 1)

      return createRestoredMembershipFixture({
        knowledgeBaseId: currentJob.knowledgeBaseId,
        documentId: currentJob.documentId,
        requestedGeneration: options.requestedGeneration ?? createClaimedJobFixture.generation,
      })
    },
  } as MembershipRepository
  const jobRepository = {
    lockExecution: async (jobIdQO: DocumentIndexExecutionIdQueryObject) => {
      assert.ok(activeTransactions > 0)
      assert.deepEqual(jobIdQO, { jobId: currentJob.id })
      lockOrder.push('job')

      return createJobRecordFixture(leaseFact)
    },
    renewLease: async (saveJobHeartbeatQO: RenewDocumentIndexExecutionLeaseQueryObject) => {
      assert.ok(activeTransactions > 0)
      assert.equal(saveJobHeartbeatQO.jobId, currentJob.id)
      assert.ok(saveJobHeartbeatQO.reservedAt instanceof Date)
      const verification = saveJobHeartbeatQO.executionVerification
      assert.equal(verification.claimToken, createClaimedJobFixture.leaseToken)
      assert.ok(verification.leaseExpiresAt)
      leaseFact.leaseExpiresAt = new Date(verification.leaseExpiresAt)
      heartbeatCount += 1

      if (heartbeatCount === 4) {
        renewalObserved.resolve()

        if (options.failRenewal) throw new Error('heartbeat failed')
      }
    },
  } as DocumentIndexExecutionQueue
  const documentIndexRepository = createRepositoryStub<DocumentIndexRepository>({
    findByDocumentIndexId: async ({ documentIndexId }) => {
      assert.equal(documentIndexId, currentJob.documentIndexId)

      return createRestoredDocumentIndexFixture({ id: documentIndexId, documentId: currentJob.documentId })
    },
  })
  const failJob = {
    handle: async ({ jobDelivery, failureDecision }: DocumentIndexingFailedEvent) => {
      assert.deepEqual(jobDelivery, {
        id: currentJob.id,
        knowledgeBaseId: currentJob.knowledgeBaseId,
        documentId: currentJob.documentId,
        documentIndexId: currentJob.documentIndexId,
        generation: currentJob.generation,
        attempts: currentJob.attempts,
        leaseToken: currentJob.leaseToken,
        leaseExpiresAt: currentJob.leaseExpiresAt,
      })
      failed.push(failureDecision)
    },
  }
  const replaceIndexPlan = {
    execute: async ({ markdownChunkPlan, chunkEmbeddings }: ReplaceIndexChunkInputDto) => {
      savedPlans.push({ vectors: chunkEmbeddings, contents: markdownChunkPlan.chunks.map((chunk) => chunk.content) })
      assert.equal(chunkEmbeddings.length, markdownChunkPlan.chunks.length)
    },
  }
  const chunkPlanner = {
    plan: async (source: string) => createMarkdownChunkPlan(source),
    modelId: 'planner',
  }
  const embeddings = {
    embed: async () => embeddingResult.promise,
    modelId: 'embeddings',
  }
  const completeJob = {
    handle: async ({ jobDelivery }: DocumentIndexedEvent) => {
      assert.deepEqual(jobDelivery, {
        id: currentJob.id,
        knowledgeBaseId: currentJob.knowledgeBaseId,
        documentId: currentJob.documentId,
        documentIndexId: currentJob.documentIndexId,
        generation: currentJob.generation,
        attempts: currentJob.attempts,
        leaseToken: currentJob.leaseToken,
        leaseExpiresAt: currentJob.leaseExpiresAt,
      })
      assert.equal(savedPlans.length, 1, 'completion must follow plan persistence')
      completeCount += 1
    },
  }

  return {
    useCase: new ProcessDocumentIndexListener(
      persistenceTransaction,
      new ReserveDocumentForIndexingUseCase(documentRepository),
      new ReserveMembershipForIndexingUseCase(membershipRepository),
      jobRepository,
      documentIndexRepository,
      replaceIndexPlan,
      completeJob,
      failJob,
      embeddings,
      chunkPlanner,
      30,
      {
        execute: async ({ revisionId }) => {
          assert.equal(revisionId, 'revision')
          loadingStarted.resolve()
          const content = options.blockLoading ? await loadingResult.promise : '# Title\nBody'

          return new DocumentRevision({
            id: revisionId,
            documentId: currentJob.documentId,
            contentSha256: createHash('sha256').update(content).digest('hex'),
            title: 'Title',
            content,
            capturedAt: new Date('2020-01-01T00:00:00.000Z'),
            createdAt: new Date('2020-01-01T00:00:00.000Z'),
          })
        },
      },
    ),
    job: currentJob,
    renewalObserved: renewalObserved.promise,
    loadingStarted: loadingStarted.promise,
    loadingResult,
    embeddingResult,
    failed,
    savedPlans,
    lockOrder,
    get heartbeatCount() {
      return heartbeatCount
    },
    get completeCount() {
      return completeCount
    },
  }
}

test('renews the lease while waiting for a long embedding request', { timeout: 1000 }, async () => {
  const context = createProcessJobScenario()
  const execution = context.useCase.handle(new DocumentIndexingDispatchedEvent(context.job))

  await context.renewalObserved
  assert.equal(context.heartbeatCount, 4)

  context.embeddingResult.resolve([[0.1]])
  await execution

  assert.equal(context.completeCount, 1)
  assert.deepEqual(context.lockOrder.slice(0, 3), ['document', 'membership', 'job'])
  assert.deepEqual(context.failed, [])
  assert.deepEqual(context.savedPlans, [
    {
      vectors: [[0.1]],
      contents: createMarkdownChunkPlan('# Title\nBody').chunks.map((chunk) => chunk.content),
    },
  ])
})

test('rejects an incomplete embedding result before persisting the planned chunks', async () => {
  const context = createProcessJobScenario()
  const execution = context.useCase.handle(new DocumentIndexingDispatchedEvent(context.job))

  await context.renewalObserved
  context.embeddingResult.resolve([])
  await execution

  assert.deepEqual(context.savedPlans, [])
  assert.equal(context.completeCount, 0)
  assert.equal(context.failed.length, 1)
  assert.equal((context.failed[0] as { errorMessage: string }).errorMessage, 'Knowledge embedding is unavailable')
})

test(
  'keeps the renewal interval stable when an earlier phase outlives the original lease',
  { timeout: 1000 },
  async () => {
    const context = createProcessJobScenario({ blockLoading: true })
    const execution = context.useCase.handle(new DocumentIndexingDispatchedEvent(context.job))

    await context.loadingStarted
    await new Promise((resolve) => setTimeout(resolve, 140))
    context.loadingResult.resolve('# Title\nBody')
    await context.renewalObserved

    const heartbeatCountAtEmbeddingStart = context.heartbeatCount
    await new Promise((resolve) => setTimeout(resolve, 25))
    const heartbeatsDuringEmbedding = context.heartbeatCount - heartbeatCountAtEmbeddingStart

    assert.ok(heartbeatsDuringEmbedding < 10, `expected a bounded heartbeat cadence, got ${heartbeatsDuringEmbedding}`)

    context.embeddingResult.resolve([[0.1]])
    await execution
    assert.deepEqual(context.failed, [])
  },
)

test('fails the claimed job when lease renewal fails during an embedding request', { timeout: 1000 }, async () => {
  const context = createProcessJobScenario({ failRenewal: true })
  const execution = context.useCase.handle(new DocumentIndexingDispatchedEvent(context.job))

  await context.renewalObserved
  await new Promise((resolve) => setTimeout(resolve, 10))
  context.embeddingResult.resolve([[0.1]])
  await execution

  assert.equal(context.completeCount, 0)
  assert.equal(context.failed.length, 1)
  assert.equal((context.failed[0] as { errorMessage: string }).errorMessage, 'RAG indexing failed')
})

test('rejects a heartbeat with a replaced fencing token before writing progress', async () => {
  const context = createProcessJobScenario({ leaseFact: { leaseToken: 'replacement-token' } })

  await context.useCase.handle(new DocumentIndexingDispatchedEvent(context.job))

  assert.equal(context.heartbeatCount, 0)
  assert.equal(context.completeCount, 0)
  assert.equal(context.failed.length, 1)
  assert.deepEqual(context.savedPlans, [])
})

test('rejects a heartbeat when the membership requests a later generation', async () => {
  const context = createProcessJobScenario({ requestedGeneration: '2' })

  await context.useCase.handle(new DocumentIndexingDispatchedEvent(context.job))

  assert.equal(context.heartbeatCount, 0)
  assert.equal(context.failed.length, 1)
  assert.deepEqual(context.savedPlans, [])
})

test('rejects a heartbeat when the persisted attempt differs from the claim', async () => {
  const context = createProcessJobScenario({ leaseFact: { attempts: createClaimedJobFixture.attempts + 1 } })

  await context.useCase.handle(new DocumentIndexingDispatchedEvent(context.job))

  assert.equal(context.heartbeatCount, 0)
  assert.equal(context.failed.length, 1)
  assert.deepEqual(context.savedPlans, [])
})

test('checks the live lease with a fresh clock after acquiring the parent locks', async () => {
  const context = createProcessJobScenario({ expireDuringParentLock: true })

  await context.useCase.handle(new DocumentIndexingDispatchedEvent(context.job))

  assert.equal(context.heartbeatCount, 0)
  assert.equal(context.failed.length, 1)
  assert.deepEqual(context.lockOrder, ['document', 'membership', 'job'])
  assert.deepEqual(context.savedPlans, [])
})
