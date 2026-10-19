import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDocumentFixture,
  createRestoredDocumentIndexFixture,
  createRestoredKnowledgeBaseDocumentFixture,
} from './document-index-lifecycle.fixture.ts'
import type { DocumentIndexExecutionRecordDTO } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-index-execution-record.dto.ts'
import { DocumentIndexExecutionClaimConflictException } from '../../../src/Application/DocumentIndexes/Exceptions/document-index-execution-claim-conflict.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { DispatchDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/dispatch-document-indexing.listener.ts'
import type { DocumentIndexExecutionStatusFields } from '../../../src/Application/DocumentIndexes/QueryObjects/document-index-execution.query-object.ts'
import type { DocumentRepository } from '../../../src/Application/Documents/Contracts/document.repository.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import type { KnowledgeBaseDocumentRepository } from '../../../src/Application/KnowledgeBaseDocuments/Contracts/knowledge-base-document.repository.ts'
import type { KnowledgeBaseDocumentActivationQueryObject } from '../../../src/Application/KnowledgeBaseDocuments/QueryObjects/knowledge-base-document.query-object.ts'
import { ActivateKnowledgeBaseDocumentIndexUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/activate-knowledge-base-document-index.use-case.ts'
import { ReserveKnowledgeBaseDocumentForIndexingUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/reserve-knowledge-base-document-for-indexing.use-case.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'

type ClaimJobDependencies = ConstructorParameters<typeof DispatchDocumentIndexingListener>
const epoch = new Date('2020-01-01T00:00:00.000Z')
const createSignal = () => {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })

  return { promise, resolve }
}

const createClaimableJobFixture = (
  attributes: Partial<DocumentIndexExecutionRecordDTO> = {},
): DocumentIndexExecutionRecordDTO => ({
  id: 'job',
  knowledgeBaseId: 'knowledge-base',
  documentId: 'document',
  documentIndexId: 'index',
  generation: '1',
  attempts: 2,
  status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
  availableAt: epoch,
  reservedAt: null,
  leaseToken: null,
  leaseExpiresAt: null,
  idempotencyKey: null,
  retryOfFailedJobId: null,
  payload: { source: 'test' },
  executionState: null,
  executionVerification: null,
  createdAt: epoch,
  updatedAt: epoch,
  ...attributes,
})
const createClaimKnowledgeBaseDocumentFixture = (
  documentId = 'document',
  requestedGeneration = '1',
  activeDocumentIndexId: string | null = null,
) =>
  createRestoredKnowledgeBaseDocumentFixture({
    knowledgeBaseId: 'knowledge-base',
    documentId,
    requestedGeneration,
    activeDocumentIndexId,
    isEntry: false,
    alwaysIncludeFullContent: false,
    updatedAt: epoch,
  })
const createClaimJobScenario = (
  overrides: {
    transaction?: ClaimJobDependencies[0]
    documents?: Partial<DocumentRepository>
    knowledgeBaseDocuments?: Partial<KnowledgeBaseDocumentRepository>
    indexes?: Partial<ClaimJobDependencies[3]>
    jobs?: Partial<ClaimJobDependencies[4]>
    failedJobs?: Partial<ClaimJobDependencies[5]>
    successReceipts?: Partial<ClaimJobDependencies[9]>
  } = {},
): DispatchDocumentIndexingListener => {
  const persistenceTransaction = overrides.transaction ?? {
    run: async <T>(operation: () => Promise<T>) => operation(),
    runReadOnlySnapshot: async () => assert.fail('claiming uses a write transaction'),
  }
  const documentRepository = {
    lockByDocumentIdSkipLocked: async () => createDocumentFixture(),
    ...overrides.documents,
  } as unknown as DocumentRepository
  const knowledgeBaseDocumentRepository = {
    lockByKnowledgeBaseIdAndDocumentIdSkipLocked: async () => createClaimKnowledgeBaseDocumentFixture(),
    findByKnowledgeBaseIdAndDocumentId: async () => null,
    updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId: async () =>
      assert.fail('no activation expected'),
    ...overrides.knowledgeBaseDocuments,
  } as unknown as KnowledgeBaseDocumentRepository
  const documentIndexRepository = {
    lockByDocumentIndexIdSkipLocked: async (documentIndexIdQO: { documentIndexId: string }) => {
      const { documentIndexId } = documentIndexIdQO

      return createRestoredDocumentIndexFixture({
        id: documentIndexId,
        status: DocumentIndexStatusEnum.BUILDING,
      })
    },
    findByDocumentIndexId: async ({ documentIndexId }: { documentIndexId: string }) =>
      createRestoredDocumentIndexFixture({ id: documentIndexId }),
    updateByDocumentIndexIdWithUnreferencedSince: async () => assert.fail('no index reference expected'),
    ...overrides.indexes,
  } as unknown as ClaimJobDependencies[3]
  const jobRepository = {
    findExpiredExecutions: async () => [],
    lockExpiredExecution: async () => assert.fail('no expired job expected'),
    countAvailableExecutions: async () => 0,
    findOldestAvailableExecution: async () => assert.fail('no queued job expected'),
    lockAvailableExecution: async () => assert.fail('no queued lock expected'),
    findSiblingExecutions: async () => [],
    transitionExecution: async () => assert.fail('no status write expected'),
    releaseQueuedExecution: async () => assert.fail('no discard expected'),
    releaseRunningExecution: async () => assert.fail('no removal expected'),
    ...overrides.jobs,
  } as ClaimJobDependencies[4]
  const failedJobRepository = {
    archive: async () => assert.fail('no archive expected'),
    ...overrides.failedJobs,
  } as unknown as ClaimJobDependencies[5]

  return new DispatchDocumentIndexingListener(
    persistenceTransaction,
    new ReserveDocumentForIndexingUseCase(documentRepository),
    new ReserveKnowledgeBaseDocumentForIndexingUseCase(knowledgeBaseDocumentRepository),
    documentIndexRepository,
    jobRepository,
    failedJobRepository,
    30,
    new ActivateKnowledgeBaseDocumentIndexUseCase(knowledgeBaseDocumentRepository),
    { execute: async () => ({ projectId: 'project' }) } as unknown as ClaimJobDependencies[8],
    { archiveSuccess: async () => undefined, ...overrides.successReceipts } as ClaimJobDependencies[9],
  )
}

test('applies recovery, stale generation, activation and claim decisions through individual repositories', async () => {
  const queued = [
    createClaimableJobFixture({ id: 'stale', documentId: 'doc-a', documentIndexId: 'index-stale' }),
    createClaimableJobFixture({
      id: 'ready',
      documentId: 'doc-b',
      documentIndexId: 'index-ready',
      generation: '2',
    }),
    createClaimableJobFixture({
      id: 'claim',
      documentId: 'doc-c',
      documentIndexId: 'index-claim',
      generation: '2',
    }),
  ]
  const expired = createClaimableJobFixture({
    id: 'expired-terminal',
    documentIndexId: 'expired-index',
    status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    attempts: 4,
    executionVerification: { lease_expires_at: epoch.toISOString() },
  })
  const discarded: string[] = []
  const activations: KnowledgeBaseDocumentActivationQueryObject[] = []
  const locks: string[] = []
  const recoveryEvents: string[] = []
  const recoveryTransactions: number[] = []
  const candidateTransactions: number[] = []
  const claims: DocumentIndexExecutionStatusFields[] = []
  let transactionSequence = 0
  let activeTransaction = 0
  let current: DocumentIndexExecutionRecordDTO | undefined
  const claim = createClaimJobScenario({
    transaction: {
      runReadOnlySnapshot: async () => assert.fail('claiming uses a write transaction'),
      run: async <T>(operation: () => Promise<T>) => {
        activeTransaction = ++transactionSequence
        try {
          return await operation()
        } finally {
          activeTransaction = 0
        }
      },
    },
    documents: {
      lockByDocumentIdSkipLocked: async (documentIdQO) => {
        const { documentId } = documentIdQO

        locks.push(`document:${documentId}`)

        return createDocumentFixture({ id: documentId })
      },
    },
    knowledgeBaseDocuments: {
      findByKnowledgeBaseIdAndDocumentId: async ({ documentId }) =>
        documentId === 'document'
          ? null
          : createClaimKnowledgeBaseDocumentFixture(
              documentId,
              '2',
              documentId === 'doc-b' ? 'a-previous-index' : null,
            ),
      lockByKnowledgeBaseIdAndDocumentIdSkipLocked: async (knowledgeBaseDocumentSourceQO) => {
        const { documentId } = knowledgeBaseDocumentSourceQO

        locks.push(`knowledgeBaseDocument:${documentId}`)

        if (documentId === 'document') return null

        return createClaimKnowledgeBaseDocumentFixture(
          documentId,
          '2',
          documentId === 'doc-b' ? 'a-previous-index' : null,
        )
      },
      updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId: async (
        knowledgeBaseDocumentActivationQO,
      ) => {
        activations.push(knowledgeBaseDocumentActivationQO)

        return createRestoredKnowledgeBaseDocumentFixture({
          knowledgeBaseId: knowledgeBaseDocumentActivationQO.knowledgeBaseId,
          documentId: knowledgeBaseDocumentActivationQO.documentId,
          requestedGeneration: knowledgeBaseDocumentActivationQO.requestedGeneration,
          activeDocumentIndexId: knowledgeBaseDocumentActivationQO.documentIndexId,
          updatedAt: knowledgeBaseDocumentActivationQO.updatedAt,
        })
      },
    },
    indexes: {
      lockByDocumentIndexIdSkipLocked: async (documentIndexIdQO) => {
        const { documentIndexId } = documentIndexIdQO

        locks.push(`index:${documentIndexId}`)

        return createRestoredDocumentIndexFixture({
          id: documentIndexId,
          status: documentIndexId === 'index-ready' ? DocumentIndexStatusEnum.READY : DocumentIndexStatusEnum.BUILDING,
        })
      },
      updateByDocumentIndexIdWithUnreferencedSince: async (setDocumentIndexUnreferencedSinceQO) => {
        const { documentIndexId, unreferencedSince: date } = setDocumentIndexUnreferencedSinceQO

        if (documentIndexId === 'expired-index' && date !== null) {
          recoveryEvents.push('unreference')
          recoveryTransactions.push(activeTransaction)
        }
      },
    },
    jobs: {
      findExpiredExecutions: async () => [expired],
      lockExpiredExecution: async () => expired,
      countAvailableExecutions: async () => queued.length,
      findOldestAvailableExecution: async () => {
        candidateTransactions.push(activeTransaction)
        current = queued.shift()

        return current ?? null
      },
      lockAvailableExecution: async (queuedJobQO) => {
        const { jobId } = queuedJobQO

        locks.push(`job:${jobId}`)

        return current ?? null
      },
      releaseQueuedExecution: async (jobIdQO) => {
        const { jobId } = jobIdQO

        discarded.push(jobId)

        return true
      },
      transitionExecution: async (updateJobStatusQO) => {
        const { jobId, expectedStatus, ...attributes } = updateJobStatusQO

        assert.equal(jobId, 'claim')
        assert.equal(expectedStatus, DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED)
        assert.equal(attributes.status, DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING)
        claims.push(attributes)

        return true
      },
      releaseRunningExecution: async () => {
        recoveryEvents.push('remove')
        recoveryTransactions.push(activeTransaction)
      },
    },
    failedJobs: {
      archive: async (saveFailedJobQO) => {
        assert.equal(saveFailedJobQO.generation, '1')
        const retryPayload = saveFailedJobQO.retryPayload as {
          format: string
          input: unknown
          executionState: { lastError: { code: string } }
        }
        assert.equal(retryPayload.format, 'rag-v1')
        assert.deepEqual(retryPayload.input, { source: 'test' })
        assert.equal(retryPayload.executionState.lastError.code, 'INDEXING_LEASE_EXPIRED')
        recoveryEvents.push('archive')
        recoveryTransactions.push(activeTransaction)

        return { id: 'failure' } as never
      },
    },
  })
  const result = await claim.handle()
  assert.deepEqual(discarded, ['stale', 'ready'])
  assert.ok(activations[0]?.updatedAt instanceof Date)
  assert.ok(Number.isFinite(activations[0].updatedAt.getTime()))
  assert.deepEqual(activations, [
    {
      knowledgeBaseId: 'knowledge-base',
      documentId: 'doc-b',
      requestedGeneration: '2',
      expectedActiveDocumentIndexId: 'a-previous-index',
      documentIndexId: 'index-ready',
      updatedAt: activations[0].updatedAt,
    },
  ])
  assert.deepEqual(recoveryEvents, ['archive', 'unreference', 'remove'])
  assert.equal(new Set(recoveryTransactions).size, 1)
  assert.equal(result?.id, 'claim')
  assert.equal(result?.attempts, 3)
  assert.match(result?.leaseToken ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(claims[0]?.executionVerification?.claimToken, result?.leaseToken)
  assert.equal(candidateTransactions.length, 3)
  assert.equal(new Set(candidateTransactions).size, 3)
  const start = locks.indexOf('document:doc-b')
  assert.deepEqual(locks.slice(start, start + 5), [
    'document:doc-b',
    'knowledgeBaseDocument:doc-b',
    'job:ready',
    'index:a-previous-index',
    'index:index-ready',
  ])
})

test('bounds busy-document scans and carries index exclusions without claiming a job', async () => {
  const exclusions: string[][] = []
  const claim = createClaimJobScenario({
    documents: { lockByDocumentIdSkipLocked: async () => null },
    knowledgeBaseDocuments: {
      lockByKnowledgeBaseIdAndDocumentIdSkipLocked: async () =>
        assert.fail('busy document must skip knowledgeBaseDocument lock'),
    },
    jobs: {
      countAvailableExecutions: async () => 2,
      findOldestAvailableExecution: async (queuedJobSnapshotQO) => {
        const { excludedDocumentIndexIds } = queuedJobSnapshotQO

        exclusions.push([...excludedDocumentIndexIds])

        return createClaimableJobFixture({ documentIndexId: `locked-${exclusions.length}` })
      },
    },
  })
  assert.equal(await claim.handle(), null)
  assert.deepEqual(exclusions, [[], ['locked-1']])
})

test('awaits each sorted recovery in the same transaction before scanning candidates', async () => {
  const enteredRecovery = createSignal()
  const releaseRecovery = createSignal()
  const recoveryOrder: string[] = []
  const transactionIds: number[] = []
  let transactionId = 0
  const expiredJobs = ['doc-z', 'doc-a'].map((documentId) =>
    createClaimableJobFixture({
      id: documentId,
      documentId,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
      executionVerification: { lease_expires_at: epoch.toISOString() },
    }),
  )
  const claim = createClaimJobScenario({
    transaction: {
      run: async (operation) => {
        transactionId += 1

        return operation()
      },
      runReadOnlySnapshot: async () => assert.fail('recovery requires a write transaction'),
    },
    jobs: {
      findExpiredExecutions: async () => expiredJobs,
      lockExpiredExecution: async ({ jobId }) => expiredJobs.find((job) => job.id === jobId) ?? null,
      transitionExecution: async ({ jobId }) => {
        recoveryOrder.push(`start:${jobId}`)
        transactionIds.push(transactionId)

        if (jobId === 'doc-a') {
          enteredRecovery.resolve()
          await releaseRecovery.promise
        }

        recoveryOrder.push(`end:${jobId}`)

        return true
      },
      countAvailableExecutions: async () => {
        recoveryOrder.push('scan')

        return 0
      },
    },
  })
  const result = claim.handle()
  await enteredRecovery.promise
  assert.deepEqual(recoveryOrder, ['start:doc-a'])
  releaseRecovery.resolve()
  assert.equal(await result, null)
  assert.deepEqual(recoveryOrder, ['start:doc-a', 'end:doc-a', 'start:doc-z', 'end:doc-z', 'scan'])
  assert.deepEqual(transactionIds, [1, 1])
})

test('stops recovery and candidate scanning immediately when the first sorted recovery fails', async () => {
  const failure = new Error('recovery failed')
  const documentLocks: string[] = []
  const claim = createClaimJobScenario({
    documents: {
      lockByDocumentIdSkipLocked: async ({ documentId }) => {
        documentLocks.push(documentId)

        return createDocumentFixture({ id: documentId })
      },
    },
    jobs: {
      findExpiredExecutions: async () =>
        ['doc-z', 'doc-a'].map((documentId) => createClaimableJobFixture({ documentId })),
      lockExpiredExecution: async () => {
        throw failure
      },
      countAvailableExecutions: async () => assert.fail('failed recovery must prevent candidate scanning'),
    },
  })

  await assert.rejects(claim.handle(), (error) => error === failure)
  assert.deepEqual(documentLocks, ['doc-a'])
})

test('awaits each candidate before carrying its exclusion into the next bounded scan', async () => {
  const enteredScan = createSignal()
  const releaseScan = createSignal()
  const exclusions: string[][] = []
  const claim = createClaimJobScenario({
    documents: { lockByDocumentIdSkipLocked: async () => null },
    jobs: {
      countAvailableExecutions: async () => 2,
      findOldestAvailableExecution: async ({ excludedDocumentIndexIds }) => {
        exclusions.push([...excludedDocumentIndexIds])

        if (exclusions.length === 1) {
          enteredScan.resolve()
          await releaseScan.promise
        }

        return createClaimableJobFixture({ documentIndexId: `locked-${exclusions.length}` })
      },
    },
  })
  const result = claim.handle()
  await enteredScan.promise
  assert.deepEqual(exclusions, [[]])
  releaseScan.resolve()
  assert.equal(await result, null)
  assert.deepEqual(exclusions, [[], ['locked-1']])
})

test('stops a bounded scan at the first empty candidate result', async () => {
  let candidateReads = 0
  const claim = createClaimJobScenario({
    jobs: {
      countAvailableExecutions: async () => 3,
      findOldestAvailableExecution: async () => {
        candidateReads += 1

        return null
      },
    },
  })

  assert.equal(await claim.handle(), null)
  assert.equal(candidateReads, 1)
})

test('awaits sorted index locks and stops scanning after a successful claim', async () => {
  const enteredLock = createSignal()
  const releaseLock = createSignal()
  const locks: string[] = []
  const queued = createClaimableJobFixture({ documentIndexId: 'z-current' })
  let candidateReads = 0
  const claim = createClaimJobScenario({
    knowledgeBaseDocuments: {
      lockByKnowledgeBaseIdAndDocumentIdSkipLocked: async () =>
        createClaimKnowledgeBaseDocumentFixture('document', '1', 'a-previous'),
    },
    indexes: {
      lockByDocumentIndexIdSkipLocked: async ({ documentIndexId }) => {
        locks.push(`start:${documentIndexId}`)

        if (documentIndexId === 'a-previous') {
          enteredLock.resolve()
          await releaseLock.promise
        }

        locks.push(`end:${documentIndexId}`)

        return createRestoredDocumentIndexFixture({ id: documentIndexId, status: DocumentIndexStatusEnum.BUILDING })
      },
    },
    jobs: {
      countAvailableExecutions: async () => 3,
      findOldestAvailableExecution: async () => {
        candidateReads += 1

        return queued
      },
      lockAvailableExecution: async () => queued,
      transitionExecution: async () => true,
    },
  })
  const result = claim.handle()
  await enteredLock.promise
  assert.deepEqual(locks, ['start:a-previous'])
  releaseLock.resolve()
  assert.equal((await result)?.id, queued.id)
  assert.deepEqual(locks, ['start:a-previous', 'end:a-previous', 'start:z-current', 'end:z-current'])
  assert.equal(candidateReads, 1)
})

test('does not lock later indexes when an earlier existing index is busy', async () => {
  const locks: string[] = []
  const queued = createClaimableJobFixture({ documentIndexId: 'z-current' })
  const claim = createClaimJobScenario({
    knowledgeBaseDocuments: {
      lockByKnowledgeBaseIdAndDocumentIdSkipLocked: async () =>
        createClaimKnowledgeBaseDocumentFixture('document', '1', 'a-previous'),
    },
    indexes: {
      lockByDocumentIndexIdSkipLocked: async ({ documentIndexId }) => {
        locks.push(documentIndexId)

        return null
      },
    },
    jobs: {
      countAvailableExecutions: async () => 1,
      findOldestAvailableExecution: async () => queued,
      lockAvailableExecution: async () => queued,
      findSiblingExecutions: async () => assert.fail('busy index must stop the lock sequence'),
    },
  })

  assert.equal(await claim.handle(), null)
  assert.deepEqual(locks, ['a-previous'])
})

test('continues sorted index locking when the earlier index no longer exists', async () => {
  const locks: string[] = []
  const queued = createClaimableJobFixture({ documentIndexId: 'z-current' })
  const claim = createClaimJobScenario({
    knowledgeBaseDocuments: {
      lockByKnowledgeBaseIdAndDocumentIdSkipLocked: async () =>
        createClaimKnowledgeBaseDocumentFixture('document', '1', 'a-previous'),
    },
    indexes: {
      lockByDocumentIndexIdSkipLocked: async ({ documentIndexId }) => {
        locks.push(documentIndexId)

        return documentIndexId === 'a-previous'
          ? null
          : createRestoredDocumentIndexFixture({ id: documentIndexId, status: DocumentIndexStatusEnum.BUILDING })
      },
      findByDocumentIndexId: async () => null,
    },
    jobs: {
      countAvailableExecutions: async () => 1,
      findOldestAvailableExecution: async () => queued,
      lockAvailableExecution: async () => queued,
      transitionExecution: async () => true,
    },
  })

  assert.equal((await claim.handle())?.id, queued.id)
  assert.deepEqual(locks, ['a-previous', 'z-current'])
})

test('does not lock later indexes or scan another candidate after a lock error', async () => {
  const failure = new Error('index lock failed')
  const locks: string[] = []
  const queued = createClaimableJobFixture({ documentIndexId: 'z-current' })
  let candidateReads = 0
  const claim = createClaimJobScenario({
    knowledgeBaseDocuments: {
      lockByKnowledgeBaseIdAndDocumentIdSkipLocked: async () =>
        createClaimKnowledgeBaseDocumentFixture('document', '1', 'a-previous'),
    },
    indexes: {
      lockByDocumentIndexIdSkipLocked: async ({ documentIndexId }) => {
        locks.push(documentIndexId)

        throw failure
      },
    },
    jobs: {
      countAvailableExecutions: async () => 3,
      findOldestAvailableExecution: async () => {
        candidateReads += 1

        return queued
      },
      lockAvailableExecution: async () => queued,
    },
  })

  await assert.rejects(claim.handle(), (error) => error === failure)
  assert.deepEqual(locks, ['a-previous'])
  assert.equal(candidateReads, 1)
})

test('waits for an active shared-index builder without changing the queued attempt', async () => {
  const queued = createClaimableJobFixture()
  const claim = createClaimJobScenario({
    jobs: {
      countAvailableExecutions: async () => 1,
      findOldestAvailableExecution: async () => queued,
      lockAvailableExecution: async () => queued,
      findSiblingExecutions: async () => [
        createClaimableJobFixture({
          id: 'builder',
          attempts: 4,
          executionVerification: { lease_expires_at: new Date(Date.now() + 30_000).toISOString() },
        }),
      ],
    },
  })
  assert.equal(await claim.handle(), null)
  assert.equal(queued.attempts, 2)
})

test('queues an expired third attempt with CAS while preserving its retry context', async () => {
  const expired = createClaimableJobFixture({
    id: 'expired-retry',
    status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    attempts: 3,
    executionState: { priorStage: 'embedding' },
    executionVerification: { lease_expires_at: epoch.toISOString() },
  })
  const writes: DocumentIndexExecutionStatusFields[] = []
  const claim = createClaimJobScenario({
    jobs: {
      findExpiredExecutions: async () => [expired],
      lockExpiredExecution: async () => expired,
      transitionExecution: async (updateJobStatusQO) => {
        const { jobId, expectedStatus, ...attributes } = updateJobStatusQO

        assert.equal(jobId, expired.id)
        assert.equal(expectedStatus, DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING)
        writes.push(attributes)

        return true
      },
    },
  })
  assert.equal(await claim.handle(), null)
  assert.equal(writes.length, 1)
  assert.equal(writes[0]?.status, DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED)
  assert.equal(Object.hasOwn(writes[0]!, 'attempts'), false)
  assert.equal(writes[0]?.reservedAt, null)
  assert.equal(writes[0]?.leaseToken, null)
  assert.equal(writes[0]?.executionVerification, null)
  assert.equal(writes[0]?.executionState?.priorStage, 'embedding')
  assert.deepEqual((writes[0]?.executionState?.lastError as { code: string }).code, 'INDEXING_LEASE_EXPIRED')
})

test('rejects a lost queued-to-running CAS without returning a claimed job', async () => {
  const queued = createClaimableJobFixture()
  const claim = createClaimJobScenario({
    jobs: {
      countAvailableExecutions: async () => 1,
      findOldestAvailableExecution: async () => queued,
      lockAvailableExecution: async () => queued,
      transitionExecution: async () => false,
    },
  })
  await assert.rejects(claim.handle(), {
    name: DocumentIndexExecutionClaimConflictException.name,
    code: 'INDEX_JOB_CLAIM_CONFLICT',
    context: { jobId: queued.id, transition: 'leaseClaim' },
    message: `RAG job ${queued.id} changed while its lease was claimed`,
  })
})

test('propagates a typed retry CAS conflict out of the recovery transaction', async () => {
  const expired = createClaimableJobFixture({
    id: 'expired-retry',
    status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    executionVerification: { lease_expires_at: epoch.toISOString() },
  })
  const transactionErrors: unknown[] = []
  const claim = createClaimJobScenario({
    transaction: {
      runReadOnlySnapshot: async () => assert.fail('claiming uses a write transaction'),
      run: async <T>(operation: () => Promise<T>) => {
        try {
          return await operation()
        } catch (error) {
          transactionErrors.push(error)
          throw error
        }
      },
    },
    jobs: {
      findExpiredExecutions: async () => [expired],
      lockExpiredExecution: async () => expired,
      transitionExecution: async () => false,
    },
  })

  await assert.rejects(claim.handle(), {
    name: DocumentIndexExecutionClaimConflictException.name,
    code: 'INDEX_JOB_CLAIM_CONFLICT',
    context: { jobId: expired.id, transition: 'expiredRetry' },
    message: `Expired RAG job ${expired.id} changed while its retry was queued`,
  })
  assert.equal(transactionErrors.length, 1)
  assert.ok(transactionErrors[0] instanceof DocumentIndexExecutionClaimConflictException)
})

test('propagates a typed discard CAS conflict after ready index activation so the transaction can roll back', async () => {
  const queued = createClaimableJobFixture({ id: 'ready-job' })
  const events: string[] = []
  const claim = createClaimJobScenario({
    transaction: {
      runReadOnlySnapshot: async () => assert.fail('claiming uses a write transaction'),
      run: async <T>(operation: () => Promise<T>) => {
        try {
          return await operation()
        } catch (error) {
          events.push('rollback')
          throw error
        }
      },
    },
    knowledgeBaseDocuments: {
      findByKnowledgeBaseIdAndDocumentId: async () => createClaimKnowledgeBaseDocumentFixture(),
      updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId: async (
        activation,
      ) => {
        events.push('activate')

        return createRestoredKnowledgeBaseDocumentFixture({
          knowledgeBaseId: activation.knowledgeBaseId,
          documentId: activation.documentId,
          requestedGeneration: activation.requestedGeneration,
          activeDocumentIndexId: activation.documentIndexId,
          updatedAt: activation.updatedAt,
        })
      },
    },
    indexes: {
      lockByDocumentIndexIdSkipLocked: async () =>
        createRestoredDocumentIndexFixture({ id: 'index', status: DocumentIndexStatusEnum.READY }),
      updateByDocumentIndexIdWithUnreferencedSince: async () => {
        events.push('reference')
      },
    },
    successReceipts: {
      archiveSuccess: async (receipt) => {
        assert.equal(receipt.jobId, queued.id)
        assert.equal(receipt.executionVerification, null)
        events.push('receipt')
      },
    },
    jobs: {
      countAvailableExecutions: async () => 1,
      findOldestAvailableExecution: async () => queued,
      lockAvailableExecution: async () => queued,
      releaseQueuedExecution: async () => {
        events.push('discard')

        return false
      },
    },
  })

  await assert.rejects(claim.handle(), {
    name: DocumentIndexExecutionClaimConflictException.name,
    code: 'INDEX_JOB_CLAIM_CONFLICT',
    context: { jobId: queued.id, transition: 'readyActivation' },
    message: `Ready RAG job ${queued.id} changed while its index was activated`,
  })
  assert.deepEqual(events, ['activate', 'reference', 'receipt', 'discard', 'rollback'])
})

test('archives shared ready index activation before deleting its waiting job without provider evidence', async () => {
  const queued = createClaimableJobFixture({ id: 'ready-job' })
  const events: string[] = []
  const claim = createClaimJobScenario({
    transaction: {
      runReadOnlySnapshot: async () => assert.fail('claiming uses a write transaction'),
      run: async <T>(operation: () => Promise<T>) => {
        try {
          return await operation()
        } catch (error) {
          events.push('rollback')
          throw error
        }
      },
    },
    knowledgeBaseDocuments: {
      findByKnowledgeBaseIdAndDocumentId: async () => createClaimKnowledgeBaseDocumentFixture(),
      updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId: async (
        activation,
      ) => {
        events.push('activate')

        return createRestoredKnowledgeBaseDocumentFixture({
          knowledgeBaseId: activation.knowledgeBaseId,
          documentId: activation.documentId,
          requestedGeneration: activation.requestedGeneration,
          activeDocumentIndexId: activation.documentIndexId,
          updatedAt: activation.updatedAt,
        })
      },
    },
    indexes: {
      lockByDocumentIndexIdSkipLocked: async () =>
        createRestoredDocumentIndexFixture({ id: 'index', status: DocumentIndexStatusEnum.READY }),
      updateByDocumentIndexIdWithUnreferencedSince: async () => {
        events.push('reference')
      },
    },
    successReceipts: {
      archiveSuccess: async (receipt) => {
        assert.equal(receipt.jobId, queued.id)
        assert.equal(receipt.executionVerification, null)
        events.push('receipt')
      },
    },
    jobs: {
      countAvailableExecutions: async () => 1,
      findOldestAvailableExecution: async () => queued,
      lockAvailableExecution: async () => queued,
      releaseQueuedExecution: async () => {
        events.push('discard')

        return true
      },
    },
  })

  assert.equal(await claim.handle(), null)
  assert.deepEqual(events, ['activate', 'reference', 'receipt', 'discard'])
})

test('preserves the queued job when the shared index activation receipt cannot be saved', async () => {
  const queued = createClaimableJobFixture({ id: 'ready-job' })
  const events: string[] = []
  const claim = createClaimJobScenario({
    transaction: {
      runReadOnlySnapshot: async () => assert.fail('claiming uses a write transaction'),
      run: async <T>(operation: () => Promise<T>) => {
        try {
          return await operation()
        } catch (error) {
          events.push('rollback')
          throw error
        }
      },
    },
    knowledgeBaseDocuments: {
      findByKnowledgeBaseIdAndDocumentId: async () => createClaimKnowledgeBaseDocumentFixture(),
      updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId: async (
        activation,
      ) => {
        events.push('activate')

        return createRestoredKnowledgeBaseDocumentFixture({
          knowledgeBaseId: activation.knowledgeBaseId,
          documentId: activation.documentId,
          requestedGeneration: activation.requestedGeneration,
          activeDocumentIndexId: activation.documentIndexId,
          updatedAt: activation.updatedAt,
        })
      },
    },
    indexes: {
      lockByDocumentIndexIdSkipLocked: async () =>
        createRestoredDocumentIndexFixture({ id: 'index', status: DocumentIndexStatusEnum.READY }),
      updateByDocumentIndexIdWithUnreferencedSince: async () => {
        events.push('reference')
      },
    },
    successReceipts: {
      archiveSuccess: async (receipt) => {
        assert.equal(receipt.jobId, queued.id)
        assert.equal(receipt.executionVerification, null)
        events.push('receipt')
        throw new Error('receipt save failed')
      },
    },
    jobs: {
      countAvailableExecutions: async () => 1,
      findOldestAvailableExecution: async () => queued,
      lockAvailableExecution: async () => queued,
      releaseQueuedExecution: async () => {
        events.push('discard')

        return false
      },
    },
  })

  await assert.rejects(claim.handle(), { message: 'receipt save failed' })
  assert.deepEqual(events, ['activate', 'reference', 'receipt', 'rollback'])
})
