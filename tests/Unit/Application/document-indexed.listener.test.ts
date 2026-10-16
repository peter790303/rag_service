import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDocumentFixture,
  createRestoredMembershipFixture,
  createJobRecordFixture,
  createRestoredDocumentIndexFixture,
  createRepositoryStub,
} from './document-index-lifecycle.fixture.ts'
import type { DocumentIndexExecutionLeaseDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-index-execution-lease.dto.ts'
import type { DocumentIndexLifecycleFact } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-index-lifecycle.dto.ts'
import type { DocumentIndexingClaimDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-indexing-claim.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/Application/DocumentIndexes/Enums/document-index-execution-stage.enum.ts'
import { DocumentIndexedEvent } from '../../../src/Application/DocumentIndexes/Events/document-indexed.event.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-document-index-execution-lease.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { DocumentIndexedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexed.listener.ts'
import type { DocumentRepository } from '../../../src/Application/Documents/Contracts/document.repository.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import type { MembershipRepository } from '../../../src/Application/Memberships/Contracts/membership.repository.ts'
import { CompleteMembershipIndexingUseCase } from '../../../src/Application/Memberships/UseCases/complete-membership-indexing.use-case.ts'
import { ReserveMembershipForIndexingUseCase } from '../../../src/Application/Memberships/UseCases/reserve-membership-for-indexing.use-case.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'

const claimedJobFixture: DocumentIndexingClaimDto = {
  id: 'job-id',
  knowledgeBaseId: 'knowledge-base-id',
  documentId: 'document-id',
  documentIndexId: 'target-index-id',
  generation: '4',
  attempts: 1,
  leaseToken: 'lease-token',
  leaseExpiresAt: new Date('2100-01-01T00:00:00.000Z'),
  executionVerification: {
    stage: DocumentIndexExecutionStageEnum.CLAIMED,
    completedUnits: 0,
    totalUnits: null,
    verifiedAt: null,
  },
}

const jobLeaseFactFixture: DocumentIndexExecutionLeaseDto = {
  ...claimedJobFixture,
  status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
}
const previousReadyAt = new Date('2026-10-01T00:00:00.000Z')
const createDocumentIndexedListener = (
  requestedGeneration: string,
  record: DocumentIndexExecutionLeaseDto | null = jobLeaseFactFixture,
  activeDocumentIndexId: string | null = 'previous-index-id',
) => {
  const calls: string[] = []
  const lifecycleWrites = new Map<string, DocumentIndexLifecycleFact>()
  const useCase = new DocumentIndexedListener(
    {
      run: async (operation) => operation(),
      runReadOnlySnapshot: async () => assert.fail('completing an index job uses a write transaction'),
    },
    new ReserveDocumentForIndexingUseCase(
      createRepositoryStub<DocumentRepository>({
        lockByDocumentId: async () => {
          calls.push('lock-document')

          return createDocumentFixture({ id: claimedJobFixture.documentId })
        },
      }),
    ),
    new ReserveMembershipForIndexingUseCase(
      createRepositoryStub<MembershipRepository>({
        lockByKnowledgeBaseIdAndDocumentId: async () => {
          calls.push('lock-membership')

          return createRestoredMembershipFixture({
            knowledgeBaseId: claimedJobFixture.knowledgeBaseId,
            documentId: claimedJobFixture.documentId,
            requestedGeneration,
            activeDocumentIndexId,
          })
        },
        updateByKnowledgeBaseIdAndDocumentId: async () => {
          calls.push('activate-membership')
        },
      }),
    ),
    createRepositoryStub<ConstructorParameters<typeof DocumentIndexedListener>[3]>({
      lockExecution: async () => {
        calls.push('lock-job')

        return record === null ? null : createJobRecordFixture(record)
      },
      releaseExecution: async () => {
        calls.push('remove-job')
      },
    }),
    createRepositoryStub<ConstructorParameters<typeof DocumentIndexedListener>[4]>({
      lockByDocumentIndexId: async (documentIndexIdQO) => {
        const { documentIndexId } = documentIndexIdQO

        calls.push(`lock-index:${documentIndexId}`)

        return createRestoredDocumentIndexFixture({
          id: documentIndexId,
          status: DocumentIndexStatusEnum.READY,
          readyAt: previousReadyAt,
        })
      },
      updateByDocumentIndexIdWithLifecycleFields: async (saveDocumentIndexLifecycleQO) => {
        const { documentIndexId, ...lifecycle } = saveDocumentIndexLifecycleQO

        calls.push(`save-index:${documentIndexId}`)
        lifecycleWrites.set(documentIndexId, lifecycle)
      },
    }),
    new CompleteMembershipIndexingUseCase(
      createRepositoryStub<MembershipRepository>({
        updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId: async (
          activation,
        ) => {
          assert.equal(activation.requestedGeneration, requestedGeneration)
          assert.equal(activation.expectedActiveDocumentIndexId, activeDocumentIndexId)
          calls.push('activate-membership')

          return createRestoredMembershipFixture({
            knowledgeBaseId: activation.knowledgeBaseId,
            documentId: activation.documentId,
            requestedGeneration: activation.requestedGeneration,
            activeDocumentIndexId: activation.documentIndexId,
            updatedAt: activation.updatedAt,
          })
        },
      }),
    ),
  )

  return { useCase, calls, lifecycleWrites }
}

test('activates a ready index only after locking completion facts in order', async () => {
  const context = createDocumentIndexedListener('4')
  const completedAt = new Date('2026-10-14T00:00:30.000Z')

  await context.useCase.handle(new DocumentIndexedEvent({ jobDelivery: claimedJobFixture, completedAt: completedAt }))

  assert.deepEqual(context.calls, [
    'lock-document',
    'lock-membership',
    'lock-job',
    'lock-index:previous-index-id',
    'lock-index:target-index-id',
    'save-index:target-index-id',
    'activate-membership',
    'save-index:previous-index-id',
    'remove-job',
  ])
  assert.deepEqual(context.lifecycleWrites.get('target-index-id'), {
    status: DocumentIndexStatusEnum.READY,
    readyAt: completedAt,
    unreferencedSince: null,
  })
  assert.deepEqual(context.lifecycleWrites.get('previous-index-id'), {
    status: DocumentIndexStatusEnum.READY,
    readyAt: previousReadyAt,
    unreferencedSince: completedAt,
  })
})

test('rejects a superseded generation without marking ready or deleting the job', async () => {
  const context = createDocumentIndexedListener('5')

  await assert.rejects(
    context.useCase.handle(
      new DocumentIndexedEvent({
        jobDelivery: claimedJobFixture,
        completedAt: new Date('2026-10-14T00:00:30.000Z'),
      }),
    ),
    InvalidDocumentIndexExecutionLeaseException,
  )

  assert.deepEqual(context.calls, ['lock-document', 'lock-membership'])
})

test('rejects stale identity, attempt, token, status and expired lease before any index write', async () => {
  const invalidRecords: (DocumentIndexExecutionLeaseDto | null)[] = [
    null,
    { ...jobLeaseFactFixture, id: 'another-job' },
    { ...jobLeaseFactFixture, knowledgeBaseId: 'another-base' },
    { ...jobLeaseFactFixture, documentId: 'another-document' },
    { ...jobLeaseFactFixture, documentIndexId: 'another-index' },
    { ...jobLeaseFactFixture, generation: '5' },
    { ...jobLeaseFactFixture, attempts: 2 },
    { ...jobLeaseFactFixture, leaseToken: 'new-token' },
    { ...jobLeaseFactFixture, status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED },
    { ...jobLeaseFactFixture, leaseExpiresAt: null },
    { ...jobLeaseFactFixture, leaseExpiresAt: new Date('2000-01-01T00:00:00.000Z') },
  ]

  await invalidRecords.reduce(async (previous, record) => {
    await previous
    const context = createDocumentIndexedListener('4', record)

    await assert.rejects(
      context.useCase.handle(new DocumentIndexedEvent({ jobDelivery: claimedJobFixture, completedAt: new Date() })),
      InvalidDocumentIndexExecutionLeaseException,
    )
    assert.deepEqual(context.calls, ['lock-document', 'lock-membership', 'lock-job'])
    assert.equal(context.lifecycleWrites.size, 0)
  }, Promise.resolve())
})

test('locks a shared active target once and does not detach the newly ready index', async () => {
  const context = createDocumentIndexedListener('4', jobLeaseFactFixture, claimedJobFixture.documentIndexId)

  await context.useCase.handle(new DocumentIndexedEvent({ jobDelivery: claimedJobFixture, completedAt: new Date() }))

  assert.deepEqual(
    context.calls.filter((call) => call.startsWith('lock-index:')),
    ['lock-index:target-index-id'],
  )
  assert.equal(context.lifecycleWrites.size, 1)
  assert.equal(context.lifecycleWrites.get(claimedJobFixture.documentIndexId)?.unreferencedSince, null)
})
