import assert from 'node:assert/strict'
import test from 'node:test'

import { concatMap, firstValueFrom, from, toArray } from 'rxjs'

import {
  createDocumentFixture,
  createRestoredKnowledgeBaseDocumentFixture,
  createJobRecordFixture,
  createRestoredDocumentIndexFixture,
  createRepositoryStub,
} from './document-index-lifecycle.fixture.ts'
import type { DocumentIndexExecutionLeaseDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-index-execution-lease.dto.ts'
import type { DocumentIndexLifecycleFact } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-index-lifecycle.dto.ts'
import type { DocumentIndexingClaimDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-indexing-claim.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/DocumentIndexes/Application/Enums/document-index-execution-stage.enum.ts'
import { DocumentIndexedEvent } from '../../../src/DocumentIndexes/Application/Events/document-indexed.event.ts'
import { DocumentIndexingNotFoundException } from '../../../src/DocumentIndexes/Application/Exceptions/document-indexing-not-found.exception.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../src/DocumentIndexes/Application/Exceptions/invalid-document-index-execution-lease.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/DocumentIndexes/Application/Helpers/document-index-execution-lifecycle.helper.ts'
import { DocumentIndexedListener } from '../../../src/DocumentIndexes/Application/Listeners/document-indexed.listener.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { ReserveDocumentForIndexingCommandHandler } from '../../../src/Documents/Application/Commands/reserve-document-for-indexing.command.handler.ts'
import type { DocumentRepository } from '../../../src/Documents/Application/Ports/Out/Repositories/document.repository.ts'
import { CompleteKnowledgeBaseDocumentIndexingCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/complete-knowledge-base-document-indexing.command.handler.ts'
import { ReserveKnowledgeBaseDocumentForIndexingCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/reserve-knowledge-base-document-for-indexing.command.handler.ts'
import type { KnowledgeBaseDocumentRepository } from '../../../src/KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base-document.repository.ts'
import { KnowledgeBase } from '../../../src/KnowledgeBases/Domain/Entities/knowledge-base.ts'

const claimedJobFixture: DocumentIndexingClaimDTO = {
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

const jobLeaseFactFixture: DocumentIndexExecutionLeaseDTO = {
  ...claimedJobFixture,
  status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
}
const previousReadyAt = new Date('2026-10-01T00:00:00.000Z')
const createDocumentIndexedListener = (
  requestedGeneration: string,
  record: DocumentIndexExecutionLeaseDTO | null = jobLeaseFactFixture,
  activeDocumentIndexId: string | null = 'previous-index-id',
  beforeIndexLock: (documentIndexId: string) => Promise<void> = async () => {},
  knowledgeBaseExists = true,
) => {
  const calls: string[] = []
  const successReceipts: unknown[] = []
  const lifecycleWrites = new Map<string, DocumentIndexLifecycleFact>()
  const useCase = new DocumentIndexedListener(
    {
      run: async (operation) => operation(),
      runReadOnlySnapshot: async () => assert.fail('completing an index job uses a write transaction'),
    },
    new ReserveDocumentForIndexingCommandHandler(
      createRepositoryStub<DocumentRepository>({
        lockByDocumentId: async () => {
          calls.push('lock-document')

          return createDocumentFixture({ id: claimedJobFixture.documentId })
        },
      }),
    ),
    new ReserveKnowledgeBaseDocumentForIndexingCommandHandler(
      createRepositoryStub<KnowledgeBaseDocumentRepository>({
        lockByKnowledgeBaseIdAndDocumentId: async () => {
          calls.push('lock-knowledgeBaseDocument')

          return createRestoredKnowledgeBaseDocumentFixture({
            knowledgeBaseId: claimedJobFixture.knowledgeBaseId,
            documentId: claimedJobFixture.documentId,
            requestedGeneration,
            activeDocumentIndexId,
          })
        },
        updateByKnowledgeBaseIdAndDocumentId: async () => {
          calls.push('activate-knowledgeBaseDocument')
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
        await beforeIndexLock(documentIndexId)

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
    new CompleteKnowledgeBaseDocumentIndexingCommandHandler(
      createRepositoryStub<KnowledgeBaseDocumentRepository>({
        updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId: async (
          activation,
        ) => {
          assert.equal(activation.requestedGeneration, requestedGeneration)
          assert.equal(activation.expectedActiveDocumentIndexId, activeDocumentIndexId)
          calls.push('activate-knowledgeBaseDocument')

          return createRestoredKnowledgeBaseDocumentFixture({
            knowledgeBaseId: activation.knowledgeBaseId,
            documentId: activation.documentId,
            requestedGeneration: activation.requestedGeneration,
            activeDocumentIndexId: activation.documentIndexId,
            updatedAt: activation.updatedAt,
          })
        },
      }),
    ),
    createRepositoryStub<ConstructorParameters<typeof DocumentIndexedListener>[6]>({
      execute: async (getKnowledgeBaseQO) => {
        assert.deepEqual(getKnowledgeBaseQO, { knowledgeBaseId: claimedJobFixture.knowledgeBaseId })
        calls.push('get-knowledge-base')

        return knowledgeBaseExists
          ? KnowledgeBase.create({
              id: claimedJobFixture.knowledgeBaseId,
              projectId: 'project-id',
              projectName: 'Project',
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            })
          : null
      },
    }),
    createRepositoryStub<ConstructorParameters<typeof DocumentIndexedListener>[7]>({
      archiveSuccess: async (successQO) => {
        calls.push('archive-success')
        successReceipts.push(successQO)
      },
    }),
  )

  return { useCase, calls, lifecycleWrites, successReceipts }
}

test('activates a ready index only after locking completion facts in order', async () => {
  const context = createDocumentIndexedListener('4')
  const completedAt = new Date('2026-10-14T00:00:30.000Z')

  await context.useCase.handle(new DocumentIndexedEvent({ jobDelivery: claimedJobFixture, completedAt: completedAt }))

  assert.deepEqual(context.calls, [
    'get-knowledge-base',
    'lock-document',
    'lock-knowledgeBaseDocument',
    'lock-job',
    'lock-index:previous-index-id',
    'lock-index:target-index-id',
    'save-index:target-index-id',
    'activate-knowledgeBaseDocument',
    'save-index:previous-index-id',
    'archive-success',
    'remove-job',
  ])
  assert.deepEqual(context.successReceipts, [
    {
      projectId: 'project-id',
      jobId: claimedJobFixture.id,
      knowledgeBaseId: claimedJobFixture.knowledgeBaseId,
      documentId: claimedJobFixture.documentId,
      documentIndexId: claimedJobFixture.documentIndexId,
      generation: claimedJobFixture.generation,
      attempts: claimedJobFixture.attempts,
      executionVerification: claimedJobFixture.executionVerification,
      completedAt,
    },
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

  assert.deepEqual(context.calls, ['get-knowledge-base', 'lock-document', 'lock-knowledgeBaseDocument'])
})

test('does not complete or archive a job when its knowledge base cannot be loaded', async () => {
  const context = createDocumentIndexedListener('4', jobLeaseFactFixture, 'previous-index-id', async () => {}, false)

  await assert.rejects(
    context.useCase.handle(
      new DocumentIndexedEvent({
        jobDelivery: claimedJobFixture,
        completedAt: new Date('2026-10-14T00:00:30.000Z'),
      }),
    ),
    DocumentIndexingNotFoundException,
  )

  assert.deepEqual(context.calls, ['get-knowledge-base'])
  assert.deepEqual(context.successReceipts, [])
})

test('rejects stale identity, attempt, token, status and expired lease before any index write', async () => {
  const invalidRecords: (DocumentIndexExecutionLeaseDTO | null)[] = [
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

  await firstValueFrom(
    from(invalidRecords).pipe(
      concatMap(async (record) => {
        const context = createDocumentIndexedListener('4', record)

        await assert.rejects(
          context.useCase.handle(new DocumentIndexedEvent({ jobDelivery: claimedJobFixture, completedAt: new Date() })),
          InvalidDocumentIndexExecutionLeaseException,
        )
        assert.deepEqual(context.calls, [
          'get-knowledge-base',
          'lock-document',
          'lock-knowledgeBaseDocument',
          'lock-job',
        ])
        assert.equal(context.lifecycleWrites.size, 0)
      }),
      toArray(),
    ),
  )
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

test('locks previous and target indexes in sorted order and awaits each lock before continuing', async () => {
  let resolveFirstLock!: () => void
  const firstLockStarted = new Promise<void>((resolve) => {
    resolveFirstLock = resolve
  })
  let releaseFirstLock!: () => void
  const firstLockGate = new Promise<void>((resolve) => {
    releaseFirstLock = resolve
  })
  const context = createDocumentIndexedListener('4', jobLeaseFactFixture, 'previous-index-id', async (id) => {
    if (id === 'previous-index-id') {
      resolveFirstLock()
      await firstLockGate
    }
  })
  const pending = context.useCase.handle(
    new DocumentIndexedEvent({ jobDelivery: claimedJobFixture, completedAt: new Date('2026-10-14T00:00:30.000Z') }),
  )

  await firstLockStarted
  const indexLockCallsBeforeFirstLockFinishes = context.calls.filter((call) => call.startsWith('lock-index:'))
  releaseFirstLock()
  await pending

  assert.deepEqual(indexLockCallsBeforeFirstLockFinishes, ['lock-index:previous-index-id'])
  assert.deepEqual(
    context.calls.filter((call) => call.startsWith('lock-index:')),
    ['lock-index:previous-index-id', 'lock-index:target-index-id'],
  )
})

test('stops locking indexes after the first sorted index lock fails', async () => {
  const failure = new Error('previous index lock failed')
  const context = createDocumentIndexedListener('4', jobLeaseFactFixture, 'previous-index-id', async (id) => {
    if (id === 'previous-index-id') throw failure
  })

  await assert.rejects(
    context.useCase.handle(
      new DocumentIndexedEvent({ jobDelivery: claimedJobFixture, completedAt: new Date('2026-10-14T00:00:30.000Z') }),
    ),
    (error: unknown) => error === failure,
  )

  assert.deepEqual(
    context.calls.filter((call) => call.startsWith('lock-index:')),
    ['lock-index:previous-index-id'],
  )
  assert.equal(context.lifecycleWrites.size, 0)
  assert.equal(context.calls.includes('remove-job'), false)
})
