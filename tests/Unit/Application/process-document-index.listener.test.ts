import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test, { type TestContext } from 'node:test'

import {
  createDocumentFixture,
  createRepositoryStub,
  createJobRecordFixture,
  createRestoredDocumentIndexFixture,
  createRestoredKnowledgeBaseDocumentFixture,
} from './document-index-lifecycle.fixture.ts'
import type { DocumentIndexExecutionLeaseDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-index-execution-lease.dto.ts'
import { type DocumentIndexingClaimDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-indexing-claim.dto.ts'
import type { MarkdownChunkPlan } from '../../../src/DocumentIndexes/Application/DataTransferObjects/markdown-chunk-plan.dto.ts'
import type { ReplaceIndexChunkInputDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/replace-index-chunk-input.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/DocumentIndexes/Application/Enums/document-index-execution-stage.enum.ts'
import type { DocumentIndexedEvent } from '../../../src/DocumentIndexes/Application/Events/document-indexed.event.ts'
import { DocumentIndexingDispatchedEvent } from '../../../src/DocumentIndexes/Application/Events/document-indexing-dispatched.event.ts'
import type { DocumentIndexingFailedEvent } from '../../../src/DocumentIndexes/Application/Events/document-indexing-failed.event.ts'
import { ChunkPlanningUnavailableException } from '../../../src/DocumentIndexes/Application/Exceptions/chunk-planning-unavailable.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/DocumentIndexes/Application/Helpers/document-index-execution-lifecycle.helper.ts'
import { ProcessDocumentIndexListener } from '../../../src/DocumentIndexes/Application/Listeners/process-document-index.listener.ts'
import type { DocumentIndexExecutionQueue } from '../../../src/DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexRepository } from '../../../src/DocumentIndexes/Application/Ports/Out/Repositories/document-index.repository.ts'
import type {
  DocumentIndexExecutionIdQueryObject,
  RenewDocumentIndexExecutionLeaseQueryObject,
} from '../../../src/DocumentIndexes/Application/QueryObjects/document-index-execution.query-object.ts'
import { ReserveDocumentForIndexingCommandHandler } from '../../../src/Documents/Application/Commands/reserve-document-for-indexing.command.handler.ts'
import type { DocumentRepository } from '../../../src/Documents/Application/Ports/Out/Repositories/document.repository.ts'
import type { DocumentIdQueryObject } from '../../../src/Documents/Application/QueryObjects/document.query-object.ts'
import { DocumentRevision } from '../../../src/Documents/Domain/Entities/document-revision.ts'
import { ReserveKnowledgeBaseDocumentForIndexingCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/reserve-knowledge-base-document-for-indexing.command.handler.ts'
import type { KnowledgeBaseDocumentRepository } from '../../../src/KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base-document.repository.ts'
import type { KnowledgeBaseDocumentSourceQueryObject } from '../../../src/KnowledgeBases/Application/QueryObjects/knowledge-base-document.query-object.ts'
import type { PersistenceTransaction } from '../../../src/Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import { createMarkdownChunkPlan } from '../../Support/markdown-chunk-plan.fixture.ts'

const createClaimedJobFixture: DocumentIndexingClaimDTO = {
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
    renewalFailureAt?: number
    renewalError?: Error
    plan?: (source: string, signal?: AbortSignal) => Promise<MarkdownChunkPlan>
    embed?: (texts: string[], signal?: AbortSignal) => Promise<number[][]>
    leaseFact?: Partial<DocumentIndexExecutionLeaseDTO>
    requestedGeneration?: string
    expireDuringParentLock?: boolean
  } = {},
) => {
  const currentJob: DocumentIndexingClaimDTO = {
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
  const leaseFact: DocumentIndexExecutionLeaseDTO = {
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
  const knowledgeBaseDocumentRepository = {
    lockByKnowledgeBaseIdAndDocumentId: async (
      knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQueryObject,
    ) => {
      assert.ok(activeTransactions > 0)
      assert.deepEqual(knowledgeBaseDocumentSourceQO, {
        knowledgeBaseId: currentJob.knowledgeBaseId,
        documentId: currentJob.documentId,
      })
      lockOrder.push('knowledgeBaseDocument')

      if (options.expireDuringParentLock) leaseFact.leaseExpiresAt = new Date(Date.now() - 1)

      return createRestoredKnowledgeBaseDocumentFixture({
        knowledgeBaseId: currentJob.knowledgeBaseId,
        documentId: currentJob.documentId,
        requestedGeneration: options.requestedGeneration ?? createClaimedJobFixture.generation,
      })
    },
  } as KnowledgeBaseDocumentRepository
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

      if (heartbeatCount === (options.renewalFailureAt ?? 4)) {
        renewalObserved.resolve()

        if (options.failRenewal) throw options.renewalError ?? new Error('heartbeat failed')
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
    execute: async ({ markdownChunkPlan, chunkEmbeddings }: ReplaceIndexChunkInputDTO) => {
      savedPlans.push({ vectors: chunkEmbeddings, contents: markdownChunkPlan.chunks.map((chunk) => chunk.content) })
      assert.equal(chunkEmbeddings.length, markdownChunkPlan.chunks.length)
    },
  }
  const chunkPlanner = {
    plan: options.plan ?? (async (source: string) => createMarkdownChunkPlan(source)),
    modelId: 'planner',
  }
  const embeddings = {
    embed: options.embed ?? (async () => embeddingResult.promise),
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
      new ReserveDocumentForIndexingCommandHandler(documentRepository),
      new ReserveKnowledgeBaseDocumentForIndexingCommandHandler(knowledgeBaseDocumentRepository),
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
  assert.deepEqual(context.lockOrder.slice(0, 3), ['document', 'knowledgeBaseDocument', 'job'])
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

test('records only allowlisted host CLI failure codes and never persists provider details', async () => {
  const safeCodeContext = createProcessJobScenario({
    plan: async () => {
      throw new ChunkPlanningUnavailableException({
        cause: Object.assign(new Error('private provider response and secret'), { code: 'HOST_CLI_BUSY_TIMEOUT' }),
      })
    },
  })
  await safeCodeContext.useCase.handle(new DocumentIndexingDispatchedEvent(safeCodeContext.job))

  assert.equal((safeCodeContext.failed[0] as { errorCode: string }).errorCode, 'HOST_CLI_BUSY_TIMEOUT')
  assert.equal(
    (safeCodeContext.failed[0] as { errorMessage: string }).errorMessage,
    'Semantic chunk planning is unavailable',
  )

  const unsafeCodeContext = createProcessJobScenario({
    plan: async () => {
      throw new ChunkPlanningUnavailableException({
        cause: Object.assign(new Error('private provider response and secret'), { code: 'secret-provider-token' }),
      })
    },
  })
  await unsafeCodeContext.useCase.handle(new DocumentIndexingDispatchedEvent(unsafeCodeContext.job))

  assert.equal((unsafeCodeContext.failed[0] as { errorCode: string }).errorCode, 'INDEXING_FAILED')
  assert.equal(
    (unsafeCodeContext.failed[0] as { errorMessage: string }).errorMessage,
    'Semantic chunk planning is unavailable',
  )
  assert.doesNotMatch(JSON.stringify(unsafeCodeContext.failed[0]), /private provider response|secret-provider-token/)
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

const assertLeaseLossCancelsProvider = async (phase: 'planning' | 'embedding', context: TestContext): Promise<void> => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const started = createDeferredJobPromise<void>()
  const aborted = createDeferredJobPromise<void>()
  const cleanup = createDeferredJobPromise<void>()
  const renewalError = new ChunkPlanningUnavailableException()
  let providerSignal: AbortSignal | undefined
  const waitForCancellation = async (signal?: AbortSignal): Promise<never> => {
    providerSignal = signal
    assert.ok(signal)
    signal.addEventListener('abort', () => aborted.resolve(), { once: true })
    started.resolve()
    await aborted.promise
    await cleanup.promise
    throw new Error('provider cancelled after cleanup')
  }
  const scenario = createProcessJobScenario({
    failRenewal: true,
    renewalFailureAt: phase === 'planning' ? 3 : 4,
    renewalError,
    ...(phase === 'planning'
      ? { plan: async (_source: string, signal?: AbortSignal) => waitForCancellation(signal) }
      : { embed: async (_texts: string[], signal?: AbortSignal) => waitForCancellation(signal) }),
  })
  const execution = scenario.useCase.handle(new DocumentIndexingDispatchedEvent(scenario.job))
  try {
    await started.promise
    context.mock.timers.tick(40)
    await aborted.promise
    assert.equal(providerSignal?.aborted, true)
    assert.equal(providerSignal?.reason, renewalError)
    assert.equal(scenario.failed.length, 0, 'failure handling must wait for provider cleanup')
    assert.deepEqual(scenario.savedPlans, [])
    cleanup.resolve()
    await execution
    assert.equal(scenario.completeCount, 0)
    assert.equal(scenario.failed.length, 1)
    assert.equal(
      (scenario.failed[0] as { errorMessage: string }).errorMessage,
      renewalError.message,
      'renewal failure must survive a different provider cancellation error',
    )
  } finally {
    aborted.resolve()
    cleanup.resolve()
    await execution
  }
}

test('cancels planning on lease loss and awaits cleanup before failing', { timeout: 1000 }, async (context) => {
  await assertLeaseLossCancelsProvider('planning', context)
})

test('cancels embedding on lease loss and awaits cleanup before failing', { timeout: 1000 }, async (context) => {
  await assertLeaseLossCancelsProvider('embedding', context)
})

test('rejects a heartbeat with a replaced fencing token before writing progress', async () => {
  const context = createProcessJobScenario({ leaseFact: { leaseToken: 'replacement-token' } })

  await context.useCase.handle(new DocumentIndexingDispatchedEvent(context.job))

  assert.equal(context.heartbeatCount, 0)
  assert.equal(context.completeCount, 0)
  assert.equal(context.failed.length, 1)
  assert.deepEqual(context.savedPlans, [])
})

test('rejects a heartbeat when the knowledgeBaseDocument requests a later generation', async () => {
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
  assert.deepEqual(context.lockOrder, ['document', 'knowledgeBaseDocument', 'job'])
  assert.deepEqual(context.savedPlans, [])
})
