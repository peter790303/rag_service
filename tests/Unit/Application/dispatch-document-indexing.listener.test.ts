import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDocumentFixture,
  createRestoredDocumentIndexFixture,
  createRestoredMembershipFixture,
} from './document-index-lifecycle.fixture.ts'
import type { DocumentIndexExecutionRecordDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-index-execution-record.dto.ts'
import { DocumentIndexExecutionClaimConflictException } from '../../../src/Application/DocumentIndexes/Exceptions/document-index-execution-claim-conflict.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { DispatchDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/dispatch-document-indexing.listener.ts'
import type { DocumentIndexExecutionStatusFields } from '../../../src/Application/DocumentIndexes/QueryObjects/document-index-execution.query-object.ts'
import type { DocumentRepository } from '../../../src/Application/Documents/Contracts/document.repository.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import type { MembershipRepository } from '../../../src/Application/Memberships/Contracts/membership.repository.ts'
import type { MembershipActivationQueryObject } from '../../../src/Application/Memberships/QueryObjects/membership.query-object.ts'
import { ActivateMembershipIndexUseCase } from '../../../src/Application/Memberships/UseCases/activate-membership-index.use-case.ts'
import { ReserveMembershipForIndexingUseCase } from '../../../src/Application/Memberships/UseCases/reserve-membership-for-indexing.use-case.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'

type ClaimJobDependencies = ConstructorParameters<typeof DispatchDocumentIndexingListener>
const epoch = new Date('2020-01-01T00:00:00.000Z')
const createClaimableJobFixture = (
  attributes: Partial<DocumentIndexExecutionRecordDto> = {},
): DocumentIndexExecutionRecordDto => ({
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
const createClaimMembershipFixture = (
  documentId = 'document',
  requestedGeneration = '1',
  activeDocumentIndexId: string | null = null,
) =>
  createRestoredMembershipFixture({
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
    memberships?: Partial<MembershipRepository>
    indexes?: Partial<ClaimJobDependencies[3]>
    jobs?: Partial<ClaimJobDependencies[4]>
    failedJobs?: Partial<ClaimJobDependencies[5]>
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
  const membershipRepository = {
    lockByKnowledgeBaseIdAndDocumentIdSkipLocked: async () => createClaimMembershipFixture(),
    findByKnowledgeBaseIdAndDocumentId: async () => null,
    updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId: async () =>
      assert.fail('no activation expected'),
    ...overrides.memberships,
  } as unknown as MembershipRepository
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
    new ReserveMembershipForIndexingUseCase(membershipRepository),
    documentIndexRepository,
    jobRepository,
    failedJobRepository,
    30,
    new ActivateMembershipIndexUseCase(membershipRepository),
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
  const activations: MembershipActivationQueryObject[] = []
  const locks: string[] = []
  const recoveryEvents: string[] = []
  const recoveryTransactions: number[] = []
  const candidateTransactions: number[] = []
  const claims: DocumentIndexExecutionStatusFields[] = []
  let transactionSequence = 0
  let activeTransaction = 0
  let current: DocumentIndexExecutionRecordDto | undefined
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
    memberships: {
      findByKnowledgeBaseIdAndDocumentId: async ({ documentId }) =>
        documentId === 'document'
          ? null
          : createClaimMembershipFixture(documentId, '2', documentId === 'doc-b' ? 'a-previous-index' : null),
      lockByKnowledgeBaseIdAndDocumentIdSkipLocked: async (membershipSourceQO) => {
        const { documentId } = membershipSourceQO

        locks.push(`membership:${documentId}`)

        if (documentId === 'document') return null

        return createClaimMembershipFixture(documentId, '2', documentId === 'doc-b' ? 'a-previous-index' : null)
      },
      updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId: async (
        membershipActivationQO,
      ) => {
        activations.push(membershipActivationQO)

        return createRestoredMembershipFixture({
          knowledgeBaseId: membershipActivationQO.knowledgeBaseId,
          documentId: membershipActivationQO.documentId,
          requestedGeneration: membershipActivationQO.requestedGeneration,
          activeDocumentIndexId: membershipActivationQO.documentIndexId,
          updatedAt: membershipActivationQO.updatedAt,
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
    'membership:doc-b',
    'job:ready',
    'index:a-previous-index',
    'index:index-ready',
  ])
})

test('bounds busy-document scans and carries index exclusions without claiming a job', async () => {
  const exclusions: string[][] = []
  const claim = createClaimJobScenario({
    documents: { lockByDocumentIdSkipLocked: async () => null },
    memberships: {
      lockByKnowledgeBaseIdAndDocumentIdSkipLocked: async () => assert.fail('busy document must skip membership lock'),
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
    memberships: {
      findByKnowledgeBaseIdAndDocumentId: async () => createClaimMembershipFixture(),
      updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId: async (
        activation,
      ) => {
        events.push('activate')

        return createRestoredMembershipFixture({
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
  assert.deepEqual(events, ['activate', 'reference', 'discard', 'rollback'])
})
