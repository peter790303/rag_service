import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDocumentFixture,
  createRestoredDocumentIndexFixture,
  createRestoredMembershipFixture,
} from './document-index-lifecycle.fixture.ts'
import { WriteRequestDocumentIndexesAssembler } from '../../../src/Application/DocumentIndexes/Assemblers/write-request-document-indexes.assembler.ts'
import { DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS } from '../../../src/Application/DocumentIndexes/Enums/document-index-request-outcome-kind.ts'
import { DocumentIndexTargetStateEnum } from '../../../src/Application/DocumentIndexes/Enums/document-index-target-state.enum.ts'
import { DocumentIndexingRequestedEvent } from '../../../src/Application/DocumentIndexes/Events/document-indexing-requested.event.ts'
import { InvalidDocumentIndexingPayloadException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-document-indexing-payload.exception.ts'
import { PreparedIndexCollectedException } from '../../../src/Application/DocumentIndexes/Exceptions/prepared-index-collected.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { DocumentIndexingRequestedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexing-requested.listener.ts'
import type { EnqueueDocumentIndexExecutionQueryObject } from '../../../src/Application/DocumentIndexes/QueryObjects/document-index-execution.query-object.ts'
import type { DocumentRevisionRepository } from '../../../src/Application/DocumentRevisions/Contracts/document-revision.repository.ts'
import type { CreateDocumentRevisionQueryObject } from '../../../src/Application/DocumentRevisions/QueryObjects/document-revision.query-object.ts'
import { PrepareDocumentRevisionForIndexRequestUseCase } from '../../../src/Application/DocumentRevisions/UseCases/prepare-document-revision-for-index-request.use-case.ts'
import type { DocumentRepository } from '../../../src/Application/Documents/Contracts/document.repository.ts'
import { IndexRequestDocumentUnavailableException } from '../../../src/Application/Documents/Exceptions/index-request-document-unavailable.exception.ts'
import { PrepareDocumentForIndexRequestUseCase } from '../../../src/Application/Documents/UseCases/prepare-document-for-index-request.use-case.ts'
import type { KnowledgeBaseRepository } from '../../../src/Application/KnowledgeBases/Contracts/knowledge-base.repository.ts'
import { EnsureIndexingKnowledgeBaseUseCase } from '../../../src/Application/KnowledgeBases/UseCases/ensure-indexing-knowledge-base.use-case.ts'
import type { MembershipRepository } from '../../../src/Application/Memberships/Contracts/membership.repository.ts'
import { IndexRequestMembershipUnavailableException } from '../../../src/Application/Memberships/Exceptions/index-request-membership-unavailable.exception.ts'
import type {
  InsertMembershipQueryObject,
  UpdateMembershipQueryObject,
} from '../../../src/Application/Memberships/QueryObjects/membership.query-object.ts'
import { PrepareMembershipForIndexRequestUseCase } from '../../../src/Application/Memberships/UseCases/prepare-membership-for-index-request.use-case.ts'
import { SaveMembershipIndexRequestUseCase } from '../../../src/Application/Memberships/UseCases/save-membership-index-request.use-case.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import {
  DocumentIndexStatusEnum,
  type DocumentIndexStatus,
} from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { DocumentRevision } from '../../../src/Domain/DocumentRevision/document-revision.ts'
import { KnowledgeBaseProjectMismatchException } from '../../../src/Domain/KnowledgeBase/Exceptions/knowledge-base-project-mismatch.exception.ts'
import { KnowledgeBase } from '../../../src/Domain/KnowledgeBase/knowledge-base.ts'

const pipelineSettings = {
  embeddingModel: 'test-embedding',
  embeddingDimensions: 2,
  chunkingModel: 'markdown-v1',
  chunkingProfile: 'markdown-v1',
  embeddingProfile: 'normalized-v1',
  lexicalProfile: 'lexical-v1',
  relationProfile: 'relations-v1',
}

const documentSourceFixture = {
  knowledgeBaseId: 'knowledge-base-1',
  projectId: 'project-1',
  projectName: 'Project',
  sourceType: DocumentSourceTypeEnum.REPOSITORY,
  sourceKey: 'document-1',
  sourcePath: 'document.md',
  content: 'content',
}

test('indexing request normalizes omitted payload and rejects malformed provided payload before dispatch', () => {
  const omittedPayload = new DocumentIndexingRequestedEvent(documentSourceFixture)
  assert.deepEqual(omittedPayload.sourceDocument.payload, {})

  const payload = { enabled: false, count: 0, optional: null }
  const providedPayload = new DocumentIndexingRequestedEvent({ ...documentSourceFixture, payload })
  assert.deepEqual(providedPayload.sourceDocument.payload, payload)
  assert.notEqual(providedPayload.sourceDocument.payload, payload)

  ;[null, false, 0, 'payload', []].forEach((invalidPayload) => {
    assert.throws(
      () =>
        new DocumentIndexingRequestedEvent({
          ...documentSourceFixture,
          payload: invalidPayload as unknown as Record<string, unknown>,
        }),
      InvalidDocumentIndexingPayloadException,
    )
  })
})

const createRequestDocumentIndexScenario = (
  options: {
    indexStatus?: DocumentIndexStatus
    knowledgeBaseProjectId?: string
    knowledgeBaseProjectName?: string
    requestedGeneration?: number
    activeDocumentIndexId?: string | null
    currentJob?: { id: string; documentIndexId: string; generation: number; status: string } | null
    failedGenerations?: number[]
    missingTargetLockAttempts?: number
    missingMembership?: boolean
    isEntry?: boolean
    unavailableMembershipAfterCreate?: boolean
    unavailableDocumentAfterUpsert?: boolean
  } = {},
) => {
  const events: string[] = []
  const failedGenerations = new Set(options.failedGenerations ?? [])
  const targetIndexId = 'index-1'
  const knowledgeBaseEvents: string[] = []
  let transactionCount = 0
  let transactionActive = false
  let targetLockAttempts = 0
  let membershipExists = !options.missingMembership
  let requestedGeneration = options.requestedGeneration ?? 4
  type Dependencies = ConstructorParameters<typeof DocumentIndexingRequestedListener>
  const persistenceTransaction = {
    runReadOnlySnapshot: async () => assert.fail('requesting an index uses write transactions'),
    run: async <T>(operation: () => Promise<T>) => {
      assert.equal(transactionActive, false, 'target re-preparation transactions must run sequentially')
      transactionActive = true
      transactionCount += 1

      try {
        return await operation()
      } finally {
        transactionActive = false
      }
    },
  }
  const knowledgeBaseRepository = {
    lockByKnowledgeBaseId: async () => {
      events.push('lock-knowledge-base')

      return options.knowledgeBaseProjectId === undefined
        ? null
        : KnowledgeBase.create({
            id: documentSourceFixture.knowledgeBaseId,
            projectId: options.knowledgeBaseProjectId,
            projectName: options.knowledgeBaseProjectName ?? 'Project',
            createdAt: new Date('2020-01-01T00:00:00.000Z'),
            updatedAt: new Date('2020-01-01T00:00:00.000Z'),
          })
    },
    create: async () => {
      events.push('create-knowledge-base')
    },
    save: async (saveKnowledgeBaseQO: { projectName: string }) => {
      knowledgeBaseEvents.push(saveKnowledgeBaseQO.projectName)
      events.push('save-knowledge-base')
    },
  } as unknown as KnowledgeBaseRepository
  const documentRepository = {
    upsertTitleBySourceTypeAndSourceKeyAndSourcePath: async () => {
      events.push('upsert-source')

      return createDocumentFixture({ id: 'document-1' })
    },
    upsertBySourceTypeAndSourceKeyAndSourcePath: async () => {
      events.push('upsert-source')

      return createDocumentFixture({ id: 'document-1' })
    },
    lockByDocumentId: async () => {
      events.push('lock-document')

      if (options.unavailableDocumentAfterUpsert) return null

      return createDocumentFixture({ id: 'document-1' })
    },
  } as unknown as DocumentRepository
  const membershipRepository = {
    insert: async (insertMembershipQO: InsertMembershipQueryObject) => {
      events.push(
        `create-membership:${insertMembershipQO.requestedGeneration}:${insertMembershipQO.activeDocumentIndexId}:${insertMembershipQO.isEntry}:${insertMembershipQO.alwaysIncludeFullContent}`,
      )
      membershipExists = !options.unavailableMembershipAfterCreate
      requestedGeneration = Number(insertMembershipQO.requestedGeneration)
    },
    lockByKnowledgeBaseIdAndDocumentId: async () => {
      events.push('lock-membership')

      if (!membershipExists) return null

      return createRestoredMembershipFixture({
        knowledgeBaseId: documentSourceFixture.knowledgeBaseId,
        documentId: 'document-1',
        requestedGeneration: String(requestedGeneration),
        activeDocumentIndexId: options.activeDocumentIndexId ?? null,
      })
    },
    updateByKnowledgeBaseIdAndDocumentId: async (updateMembershipQO: UpdateMembershipQueryObject) => {
      if (updateMembershipQO.requestedGeneration === String(requestedGeneration)) {
        assert.equal(updateMembershipQO.isEntry, options.isEntry)
        events.push('update-membership-options')
      } else events.push(`update-membership:${updateMembershipQO.requestedGeneration}`)
    },
  } as unknown as MembershipRepository
  const documentRevisionRepository = {
    findByDocumentIdAndContentSha256: async () => {
      events.push('find-revision')

      return null
    },
    create: async (createDocumentRevisionQO: CreateDocumentRevisionQueryObject) => {
      events.push('create-revision')

      return new DocumentRevision({
        ...createDocumentRevisionQO,
        id: 'revision-1',
        capturedAt: new Date(),
        createdAt: new Date(),
      })
    },
  } as unknown as DocumentRevisionRepository
  const documentIndexRepository = {
    findByDocumentRevisionIdAndPipelineHash: async () => {
      events.push('find-index')

      return null
    },
    createBuildingIndex: async () => {
      events.push('create-index')

      return createRestoredDocumentIndexFixture({
        id: targetIndexId,
        documentId: 'document-1',
        revisionId: 'revision-1',
        status: options.indexStatus ?? DocumentIndexStatusEnum.BUILDING,
      })
    },
    lockByDocumentIndexId: async (documentIndexIdQO: { documentIndexId: string }) => {
      const { documentIndexId: id } = documentIndexIdQO

      events.push(`lock-index:${id}`)

      if (id === targetIndexId) {
        targetLockAttempts += 1

        if (targetLockAttempts <= (options.missingTargetLockAttempts ?? 0)) return null
      }

      return createRestoredDocumentIndexFixture({
        id,
        documentId: 'document-1',
        revisionId: id === targetIndexId ? 'revision-1' : 'old-revision',
        status:
          id === targetIndexId
            ? (options.indexStatus ?? DocumentIndexStatusEnum.BUILDING)
            : DocumentIndexStatusEnum.READY,
      })
    },
    updateByDocumentIndexIdWithUnreferencedSince: async (setDocumentIndexUnreferencedSinceQO: {
      documentIndexId: string
      unreferencedSince: Date | null
    }) => {
      const { documentIndexId, unreferencedSince: value } = setDocumentIndexUnreferencedSinceQO

      events.push(`unreferenced:${documentIndexId}:${value === null ? 'clear' : 'set'}`)
    },
  } as unknown as Dependencies[5]
  const jobRepository = {
    lockMembershipExecution: async () => {
      events.push('lock-current-job')

      if (options.currentJob === null || options.currentJob === undefined) return null

      return { ...options.currentJob, generation: String(options.currentJob.generation) }
    },
    releaseExecution: async () => {
      events.push('remove-job')
    },
    enqueue: async (saveQueuedJobQO: EnqueueDocumentIndexExecutionQueryObject) => {
      assert.equal(saveQueuedJobQO.reservedAt, null)
      assert.equal(saveQueuedJobQO.leaseToken, null)
      assert.equal(saveQueuedJobQO.leaseExpiresAt, null)
      assert.equal(saveQueuedJobQO.idempotencyKey, null)
      assert.equal(saveQueuedJobQO.retryOfFailedJobId, null)
      assert.equal(saveQueuedJobQO.executionState, null)
      assert.equal(saveQueuedJobQO.executionVerification, null)
      events.push(
        `enqueue-job:${saveQueuedJobQO.status}:${saveQueuedJobQO.attempts}:${Number.isFinite(saveQueuedJobQO.availableAt.getTime())}`,
      )

      return { id: 'queued-job' }
    },
  } as unknown as Dependencies[6]
  const failedJobRepository = {
    findUnretriedTargetFailure: async (unretriedFailedJobTargetQO: { generation: string }) => {
      const { generation } = unretriedFailedJobTargetQO

      events.push(`check-failure:${generation}`)

      return failedGenerations.has(Number(generation)) ? { id: 'failed-job' } : null
    },
  } as unknown as Dependencies[7]
  const useCase = new DocumentIndexingRequestedListener(
    persistenceTransaction,
    new EnsureIndexingKnowledgeBaseUseCase(knowledgeBaseRepository),
    new PrepareDocumentForIndexRequestUseCase(documentRepository),
    new PrepareMembershipForIndexRequestUseCase(membershipRepository),
    new PrepareDocumentRevisionForIndexRequestUseCase(documentRevisionRepository),
    documentIndexRepository,
    jobRepository,
    failedJobRepository,
    pipelineSettings,
    new WriteRequestDocumentIndexesAssembler(pipelineSettings),
    new SaveMembershipIndexRequestUseCase(membershipRepository),
  )

  return {
    execute: () =>
      useCase.handle(
        new DocumentIndexingRequestedEvent({
          ...documentSourceFixture,
          ...(options.isEntry === undefined ? {} : { isEntry: options.isEntry }),
        }),
      ),
    events,
    knowledgeBaseEvents,
    transactionCount: () => transactionCount,
  }
}

test('request indexing updates generation and enqueues within one ordered transaction', async () => {
  const request = createRequestDocumentIndexScenario({
    currentJob: {
      id: 'obsolete-job',
      documentIndexId: 'old-index',
      generation: 4,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
    },
  })

  const result = await request.execute()

  assert.equal(request.transactionCount(), 1)
  assert.equal(result.jobId, 'queued-job')
  assert.equal(result.generation, '5')
  assert.equal(
    request.events.some((event) => event.startsWith('create-membership:')),
    false,
  )
  assert.ok(request.events.indexOf('lock-document') < request.events.indexOf('lock-membership'))
  assert.ok(request.events.indexOf('lock-membership') < request.events.indexOf('lock-current-job'))
  assert.ok(request.events.indexOf('lock-current-job') < request.events.indexOf('lock-index:index-1'))
  assert.deepEqual(
    request.events.filter((event) => event.startsWith('lock-index:')),
    ['lock-index:index-1', 'lock-index:old-index'],
  )
  assert.ok(request.events.indexOf('update-membership:5') < request.events.indexOf('enqueue-job:queued:0:true'))
  assert.equal(request.events.filter((event) => event === 'enqueue-job:queued:0:true').length, 1)
})

test('request indexing creates a missing membership while holding the document lock and locks it again', async () => {
  const request = createRequestDocumentIndexScenario({ missingMembership: true, isEntry: true })

  const result = await request.execute()

  assert.equal(result.generation, '1')
  assert.equal(request.transactionCount(), 1)
  assert.deepEqual(
    request.events.filter(
      (event) => event === 'lock-document' || event === 'lock-membership' || event.startsWith('create-membership:'),
    ),
    ['lock-document', 'lock-membership', 'create-membership:0:null:false:false', 'lock-membership'],
  )
  assert.ok(request.events.lastIndexOf('lock-membership') < request.events.indexOf('update-membership-options'))
})

test('request indexing stops when the upserted document cannot be locked', async () => {
  const request = createRequestDocumentIndexScenario({ unavailableDocumentAfterUpsert: true })

  await assert.rejects(request.execute(), (error: unknown) => {
    assert.ok(error instanceof IndexRequestDocumentUnavailableException)
    assert.equal(error.code, 'INDEX_REQUEST_DOCUMENT_UNAVAILABLE')

    return true
  })

  assert.ok(request.events.includes('upsert-source'))
  assert.ok(request.events.includes('lock-document'))
  assert.equal(request.events.includes('lock-membership'), false)
  assert.equal(request.events.includes('find-revision'), false)
  assert.equal(
    request.events.some((event) => event.startsWith('enqueue-job:')),
    false,
  )
})

test('request indexing stops when the newly created membership cannot be locked', async () => {
  const request = createRequestDocumentIndexScenario({
    missingMembership: true,
    unavailableMembershipAfterCreate: true,
  })

  await assert.rejects(request.execute(), (error: unknown) => {
    assert.ok(error instanceof IndexRequestMembershipUnavailableException)
    assert.equal(error.code, 'INDEX_REQUEST_MEMBERSHIP_UNAVAILABLE')

    return true
  })

  assert.equal(request.events.includes('update-membership-options'), false)
  assert.equal(request.events.includes('find-revision'), false)
  assert.equal(
    request.events.some((event) => event.startsWith('enqueue-job:')),
    false,
  )
})

test('request indexing rejects a knowledge base assigned to another project before processing the source', async () => {
  const request = createRequestDocumentIndexScenario({ knowledgeBaseProjectId: 'different-project' })

  await assert.rejects(request.execute(), KnowledgeBaseProjectMismatchException)

  assert.ok(request.events.includes('lock-knowledge-base'))
  assert.equal(request.events.includes('upsert-source'), false)
})

test('request indexing synchronizes the project name through the knowledge-base entity', async () => {
  const request = createRequestDocumentIndexScenario({
    knowledgeBaseProjectId: documentSourceFixture.projectId,
    knowledgeBaseProjectName: 'Old name',
  })

  await request.execute()

  assert.deepEqual(request.knowledgeBaseEvents, ['Project'])
  assert.ok(request.events.includes('save-knowledge-base'))
})

test('request indexing reuses a current target job without enqueueing another job', async () => {
  const request = createRequestDocumentIndexScenario({
    currentJob: {
      id: 'same-target-job',
      documentIndexId: 'index-1',
      generation: 4,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
    },
  })

  const result = await request.execute()

  assert.equal(result.jobId, 'same-target-job')
  assert.equal(result.generation, '4')
  assert.equal(request.events.includes('enqueue-job'), false)
})

test('request indexing blocks a generation with an unretried failure', async () => {
  const request = createRequestDocumentIndexScenario({ failedGenerations: [4] })

  const result = await request.execute()

  assert.equal(result.jobId, null)
  assert.equal(result.generation, '4')
  assert.equal(result.blockedByFailedJob, true)
  assert.equal(request.events.includes('enqueue-job'), false)
})

test('request indexing activates a ready index and retires the prior membership target', async () => {
  const request = createRequestDocumentIndexScenario({
    indexStatus: DocumentIndexTargetStateEnum.READY,
    activeDocumentIndexId: 'old-index',
    currentJob: {
      id: 'old-job',
      documentIndexId: 'old-index',
      generation: 4,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
    },
  })

  const result = await request.execute()

  assert.equal(result.documentIndexId, 'index-1')
  assert.equal(result.reusedReadyIndex, true)
  assert.equal(result.generation, '5')
  assert.ok(request.events.includes('remove-job'))
  assert.ok(request.events.includes('unreferenced:index-1:clear'))
  assert.ok(request.events.some((event) => event.startsWith('unreferenced:old-index:set')))
  assert.equal(request.events.includes('enqueue-job'), false)
})

test('request indexing re-prepares after the target index disappears before its lock', async () => {
  const request = createRequestDocumentIndexScenario({ missingTargetLockAttempts: 1 })

  const result = await request.execute()

  assert.equal(request.transactionCount(), 2)
  assert.equal(result.jobId, 'queued-job')
  assert.equal(request.events.filter((event) => event === 'lock-index:index-1').length, 2)
  assert.equal(request.events.filter((event) => event.startsWith('enqueue-job:')).length, 1)
})

test('request indexing stops after the bounded target re-preparation attempts', async () => {
  const request = createRequestDocumentIndexScenario({ missingTargetLockAttempts: 3 })

  await assert.rejects(request.execute(), (error: unknown) => {
    assert.ok(error instanceof PreparedIndexCollectedException)
    assert.equal(error.code, 'PREPARED_INDEX_COLLECTED')

    return true
  })

  assert.equal(request.transactionCount(), 3)
  assert.equal(request.events.filter((event) => event === 'lock-index:index-1').length, 3)
  assert.equal(
    request.events.some((event) => event.startsWith('enqueue-job:')),
    false,
  )
})

test('request outcome and target state values retain their discriminated domain meanings', () => {
  assert.equal(DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS.enqueue, 'enqueue')
  assert.equal(DocumentIndexTargetStateEnum.FAILED_BLOCKED, 'failed-blocked')
})
