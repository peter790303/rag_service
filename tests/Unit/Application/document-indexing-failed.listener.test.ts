import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDocumentFixture,
  createRestoredKnowledgeBaseDocumentFixture,
  createRestoredDocumentIndexFixture,
  createJobRecordFixture,
  createRepositoryStub,
} from './document-index-lifecycle.fixture.ts'
import type { DocumentIndexExecutionRecordDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-index-execution-record.dto.ts'
import type { DocumentIndexingDeliveryDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-indexing-delivery.dto.ts'
import { DocumentIndexingFailedEvent } from '../../../src/DocumentIndexes/Application/Events/document-indexing-failed.event.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../src/DocumentIndexes/Application/Exceptions/invalid-document-index-execution-lease.exception.ts'
import { InvalidDocumentIndexingFailureDecisionException } from '../../../src/DocumentIndexes/Application/Exceptions/invalid-document-indexing-failure-decision.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/DocumentIndexes/Application/Helpers/document-index-execution-lifecycle.helper.ts'
import { DocumentIndexingFailedListener } from '../../../src/DocumentIndexes/Application/Listeners/document-indexing-failed.listener.ts'
import type { DocumentIndexExecutionStatusFields } from '../../../src/DocumentIndexes/Application/QueryObjects/document-index-execution.query-object.ts'
import type { ArchiveDocumentIndexFailureQueryObject } from '../../../src/DocumentIndexes/Application/QueryObjects/document-index-failure.query-object.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { ReserveDocumentForIndexingCommandHandler } from '../../../src/Documents/Application/Commands/reserve-document-for-indexing.command.handler.ts'
import type { DocumentRepository } from '../../../src/Documents/Application/Ports/Out/Repositories/document.repository.ts'
import { ReserveKnowledgeBaseDocumentForIndexingCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/reserve-knowledge-base-document-for-indexing.command.handler.ts'
import type { KnowledgeBaseDocumentRepository } from '../../../src/KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base-document.repository.ts'

const now = new Date('2026-10-14T00:00:30.000Z')
const claimedJobFixture: DocumentIndexingDeliveryDTO = {
  id: 'job-id',
  knowledgeBaseId: 'base-id',
  documentId: 'document-id',
  documentIndexId: 'index-id',
  generation: '4',
  attempts: 4,
  leaseToken: 'token',
  leaseExpiresAt: new Date('2100-01-01T00:00:00.000Z'),
}

test('failure event rejects missing required fields before a listener can persist a retry or archive', () => {
  const decision = { errorCode: 'INDEXING_FAILED', errorMessage: '', failedAt: now, retryAt: null }
  const invalidFields = {
    errorCode: undefined,
    errorMessage: undefined,
    failedAt: undefined,
    retryAt: undefined,
  }

  Object.entries(invalidFields).forEach(([field, value]) => {
    assert.throws(
      () =>
        new DocumentIndexingFailedEvent({
          jobDelivery: claimedJobFixture,
          failureDecision: { ...decision, [field]: value },
        }),
      (error: unknown) =>
        error instanceof InvalidDocumentIndexingFailureDecisionException && error.context.field === field,
    )
  })
  const validEvent = new DocumentIndexingFailedEvent({ jobDelivery: claimedJobFixture, failureDecision: decision })
  assert.equal(validEvent.failureDecision.errorMessage, '')
  assert.equal(validEvent.failureDecision.retryAt, null)
})

const createFailedJobScenario = (
  requestedGeneration = '4',
  claimed = claimedJobFixture,
  lockedOverrides: Partial<DocumentIndexExecutionRecordDTO> = {},
) => {
  const calls: string[] = []
  let archive: ArchiveDocumentIndexFailureQueryObject | null = null
  let retryState: Record<string, unknown> | null = null
  let retryWrite: DocumentIndexExecutionStatusFields | null = null
  const useCase = new DocumentIndexingFailedListener(
    {
      runReadOnlySnapshot: async () => assert.fail('failing an index job uses a write transaction'),
      run: async (operation) => {
        calls.push('begin')
        const result = await operation()
        calls.push('commit')

        return result
      },
    },
    new ReserveDocumentForIndexingCommandHandler(
      createRepositoryStub<DocumentRepository>({
        lockByDocumentId: async () => {
          calls.push('document')

          return createDocumentFixture()
        },
      }),
    ),
    new ReserveKnowledgeBaseDocumentForIndexingCommandHandler(
      createRepositoryStub<KnowledgeBaseDocumentRepository>({
        lockByKnowledgeBaseIdAndDocumentId: async () => {
          calls.push('knowledgeBaseDocument')

          return createRestoredKnowledgeBaseDocumentFixture({ requestedGeneration })
        },
      }),
    ),
    createRepositoryStub<ConstructorParameters<typeof DocumentIndexingFailedListener>[3]>({
      lockExecution: async () => {
        calls.push('claim')

        return createJobRecordFixture({
          ...claimed,
          payload: { content: 'source' },
          executionState: { completedUnits: 2 },
          ...lockedOverrides,
        })
      },
      rescheduleExecution: async (saveJobStatusQO) => {
        const { jobId, ...write } = saveJobStatusQO

        assert.equal(jobId, claimed.id)
        calls.push('retry')
        retryState = write.executionState ?? null
        retryWrite = write
      },
      releaseExecution: async () => {
        calls.push('delete-job')
      },
    }),
    createRepositoryStub<ConstructorParameters<typeof DocumentIndexingFailedListener>[4]>({
      lockByDocumentIndexId: async (documentIndexIdQO) => {
        calls.push('index')

        return createRestoredDocumentIndexFixture({
          id: documentIndexIdQO.documentIndexId,
        })
      },
      updateByDocumentIndexIdWithLifecycleFields: async (saveDocumentIndexLifecycleQO) => {
        const { documentIndexId, ...lifecycle } = saveDocumentIndexLifecycleQO

        assert.equal(documentIndexId, claimed.documentIndexId)
        calls.push('unreference')
        assert.deepEqual(lifecycle, {
          status: DocumentIndexStatusEnum.BUILDING,
          readyAt: null,
          unreferencedSince: now,
        })
      },
    }),
    createRepositoryStub<ConstructorParameters<typeof DocumentIndexingFailedListener>[5]>({
      archive: async (saveFailedJobQO) => {
        calls.push('archive')
        archive = saveFailedJobQO
      },
    }),
  )

  return { useCase, calls, archive: () => archive, retryState: () => retryState, retryWrite: () => retryWrite }
}

test('archives the terminal failure before deleting the claim in the same transaction', async () => {
  const context = createFailedJobScenario()
  await context.useCase.handle(
    new DocumentIndexingFailedEvent({
      jobDelivery: claimedJobFixture,
      failureDecision: {
        errorCode: 'INDEXING_FAILED',
        errorMessage: 'failed',
        failedAt: now,
        retryAt: null,
      },
    }),
  )
  assert.deepEqual(context.calls, [
    'begin',
    'document',
    'knowledgeBaseDocument',
    'claim',
    'index',
    'archive',
    'unreference',
    'delete-job',
    'commit',
  ])
  assert.equal(context.archive()?.attempts, 4)
  assert.deepEqual(context.archive()?.retryPayload, {
    format: 'rag-v1',
    input: { content: 'source' },
    executionState: {
      completedUnits: 2,
      lastError: { code: 'INDEXING_FAILED', message: 'failed', failedAt: now.toISOString() },
    },
  })
})

test('retry keeps the claim history and execution progress without archiving or deleting', async () => {
  const retryJob = { ...claimedJobFixture, attempts: 1 }
  const context = createFailedJobScenario('4', retryJob)
  await context.useCase.handle(
    new DocumentIndexingFailedEvent({
      jobDelivery: retryJob,
      failureDecision: {
        errorCode: 'INDEXING_FAILED',
        errorMessage: 'failed',
        failedAt: now,
        retryAt: new Date(now.getTime() + 1000),
      },
    }),
  )
  assert.deepEqual(context.calls, ['begin', 'document', 'knowledgeBaseDocument', 'claim', 'index', 'retry', 'commit'])
  assert.equal(context.retryState()?.completedUnits, 2)
  assert.equal(context.retryWrite()?.status, DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED)
  assert.equal(context.retryWrite()?.reservedAt, null)
  assert.equal(context.retryWrite()?.leaseToken, null)
  assert.equal(context.retryWrite()?.executionVerification, null)
  assert.equal(context.archive(), null)
})

test('rejects a superseded generation before changing retry or archive state', async () => {
  const context = createFailedJobScenario('5')
  await assert.rejects(
    context.useCase.handle(
      new DocumentIndexingFailedEvent({
        jobDelivery: claimedJobFixture,
        failureDecision: {
          errorCode: 'INDEXING_FAILED',
          errorMessage: 'failed',
          failedAt: now,
          retryAt: null,
        },
      }),
    ),
    InvalidDocumentIndexExecutionLeaseException,
  )
  assert.deepEqual(context.calls, ['begin', 'document', 'knowledgeBaseDocument'])
})

test('the fourth attempt is archived even when a caller requests another retry', async () => {
  const context = createFailedJobScenario()
  await context.useCase.handle(
    new DocumentIndexingFailedEvent({
      jobDelivery: claimedJobFixture,
      failureDecision: {
        errorCode: 'INDEXING_FAILED',
        errorMessage: 'failed',
        failedAt: now,
        retryAt: new Date(now.getTime() + 1000),
      },
    }),
  )
  assert.equal(context.archive()?.attempts, 4)
  assert.equal(context.retryState(), null)
  assert.deepEqual(context.calls.slice(-4), ['archive', 'unreference', 'delete-job', 'commit'])
})

test('rejects a replaced claim without retrying, archiving or changing index retention', async () => {
  const context = createFailedJobScenario('4', claimedJobFixture, { leaseToken: 'replacement-token' })

  await assert.rejects(
    context.useCase.handle(
      new DocumentIndexingFailedEvent({
        jobDelivery: claimedJobFixture,
        failureDecision: {
          errorCode: 'FAILED',
          errorMessage: 'failed',
          failedAt: now,
          retryAt: null,
        },
      }),
    ),
    InvalidDocumentIndexExecutionLeaseException,
  )

  assert.deepEqual(context.calls, ['begin', 'document', 'knowledgeBaseDocument', 'claim'])
  assert.equal(context.archive(), null)
  assert.equal(context.retryState(), null)
})
