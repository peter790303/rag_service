import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDocumentFixture,
  createRestoredDocumentIndexFixture,
  createRestoredKnowledgeBaseDocumentFixture,
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
import type { KnowledgeBaseDocumentRepository } from '../../../src/Application/KnowledgeBaseDocuments/Contracts/knowledge-base-document.repository.ts'
import { IndexRequestKnowledgeBaseDocumentUnavailableException } from '../../../src/Application/KnowledgeBaseDocuments/Exceptions/index-request-knowledge-base-document-unavailable.exception.ts'
import type {
  InsertKnowledgeBaseDocumentQueryObject,
  UpdateKnowledgeBaseDocumentQueryObject,
} from '../../../src/Application/KnowledgeBaseDocuments/QueryObjects/knowledge-base-document.query-object.ts'
import { PrepareKnowledgeBaseDocumentForIndexRequestUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/prepare-knowledge-base-document-for-index-request.use-case.ts'
import { SaveKnowledgeBaseDocumentIndexRequestUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/save-knowledge-base-document-index-request.use-case.ts'
import type { KnowledgeBaseRepository } from '../../../src/Application/KnowledgeBases/Contracts/knowledge-base.repository.ts'
import { EnsureIndexingKnowledgeBaseUseCase } from '../../../src/Application/KnowledgeBases/UseCases/ensure-indexing-knowledge-base.use-case.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import {
  DocumentIndexStatusEnum,
  type DocumentIndexStatus,
} from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
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
    missingTargetIndex?: boolean
    indexStatus?: DocumentIndexStatus
    knowledgeBaseProjectId?: string
    knowledgeBaseProjectName?: string
    requestedGeneration?: number
    activeDocumentIndexId?: string | null
    currentJob?: { id: string; documentIndexId: string; generation: number; status: string } | null
    failedGenerations?: number[]
    missingTargetLockAttempts?: number
    beforeTargetLockAttempt?: (attempt: number) => Promise<void>
    missingKnowledgeBaseDocument?: boolean
    isEntry?: boolean
    unavailableKnowledgeBaseDocumentAfterCreate?: boolean
    unavailableDocumentAfterUpsert?: boolean
  } = {},
) => {
  const events: string[] = []
  const failedGenerations = new Set(options.failedGenerations ?? [])
  let targetIndexId = 'index-1'
  let createdIndexId: string | null = null
  let queuedJobId: string | null = null
  const knowledgeBaseEvents: string[] = []
  let transactionCount = 0
  let transactionActive = false
  let targetLockAttempts = 0
  const documentIndexLockQueries: { documentIndexId: string }[] = []
  let knowledgeBaseDocumentExists = !options.missingKnowledgeBaseDocument
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
    update: async (updateKnowledgeBaseQO: { projectName: string }) => {
      knowledgeBaseEvents.push(updateKnowledgeBaseQO.projectName)
      events.push('save-knowledge-base')
    },
  } as unknown as KnowledgeBaseRepository
  const documentRepository = {
    upsertTitleBySourceTypeAndSourceKeyAndSourcePath: async () => {
      events.push('upsert-source')
    },
    upsertBySourceTypeAndSourceKeyAndSourcePath: async () => {
      events.push('upsert-source')
    },
    findBySourceTypeAndSourceKeyAndSourcePath: async () => createDocumentFixture({ id: 'document-1' }),
    lockByDocumentId: async () => {
      events.push('lock-document')

      if (options.unavailableDocumentAfterUpsert) return null

      return createDocumentFixture({ id: 'document-1' })
    },
  } as unknown as DocumentRepository
  const knowledgeBaseDocumentRepository = {
    insert: async (insertKnowledgeBaseDocumentQO: InsertKnowledgeBaseDocumentQueryObject) => {
      events.push(
        `create-knowledgeBaseDocument:${insertKnowledgeBaseDocumentQO.requestedGeneration}:${insertKnowledgeBaseDocumentQO.activeDocumentIndexId}:${insertKnowledgeBaseDocumentQO.isEntry}:${insertKnowledgeBaseDocumentQO.alwaysIncludeFullContent}`,
      )
      knowledgeBaseDocumentExists = !options.unavailableKnowledgeBaseDocumentAfterCreate
      requestedGeneration = Number(insertKnowledgeBaseDocumentQO.requestedGeneration)
    },
    lockByKnowledgeBaseIdAndDocumentId: async () => {
      events.push('lock-knowledgeBaseDocument')

      if (!knowledgeBaseDocumentExists) return null

      return createRestoredKnowledgeBaseDocumentFixture({
        knowledgeBaseId: documentSourceFixture.knowledgeBaseId,
        documentId: 'document-1',
        requestedGeneration: String(requestedGeneration),
        activeDocumentIndexId: options.activeDocumentIndexId ?? null,
      })
    },
    updateByKnowledgeBaseIdAndDocumentId: async (
      updateKnowledgeBaseDocumentQO: UpdateKnowledgeBaseDocumentQueryObject,
    ) => {
      if (updateKnowledgeBaseDocumentQO.requestedGeneration === String(requestedGeneration)) {
        assert.equal(updateKnowledgeBaseDocumentQO.isEntry, options.isEntry)
        events.push('update-knowledge-base-document-options')
      } else events.push(`update-knowledgeBaseDocument:${updateKnowledgeBaseDocumentQO.requestedGeneration}`)
    },
  } as unknown as KnowledgeBaseDocumentRepository
  const documentRevisionRepository = {
    findByDocumentIdAndContentSha256: async () => {
      events.push('find-revision')

      return null
    },
    create: async (createDocumentRevisionQO: CreateDocumentRevisionQueryObject) => {
      events.push('create-revision')

      assert.ok(createDocumentRevisionQO.id)
    },
  } as unknown as DocumentRevisionRepository
  const documentIndexRepository = {
    findByDocumentRevisionIdAndPipelineHash: async () => {
      events.push('find-index')

      return options.missingTargetIndex
        ? null
        : createRestoredDocumentIndexFixture({
            id: targetIndexId,
            documentId: 'document-1',
            revisionId: 'revision-1',
            status: options.indexStatus ?? DocumentIndexStatusEnum.BUILDING,
          })
    },
    createBuildingIndex: async (attributes: { id: string }) => {
      events.push('create-index')
      createdIndexId = attributes.id
      targetIndexId = attributes.id
    },
    lockByDocumentIndexId: async (documentIndexIdQO: { documentIndexId: string }) => {
      const { documentIndexId: id } = documentIndexIdQO

      documentIndexLockQueries.push(documentIndexIdQO)
      events.push(`lock-index:${id}`)

      if (id === targetIndexId) {
        targetLockAttempts += 1
        await options.beforeTargetLockAttempt?.(targetLockAttempts)

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
    lockKnowledgeBaseDocumentExecution: async () => {
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

      queuedJobId = saveQueuedJobQO.id
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
    new PrepareKnowledgeBaseDocumentForIndexRequestUseCase(knowledgeBaseDocumentRepository),
    new PrepareDocumentRevisionForIndexRequestUseCase(documentRevisionRepository),
    documentIndexRepository,
    jobRepository,
    failedJobRepository,
    pipelineSettings,
    new WriteRequestDocumentIndexesAssembler(pipelineSettings),
    new SaveKnowledgeBaseDocumentIndexRequestUseCase(knowledgeBaseDocumentRepository),
    {
      execute: async ({ documentIndexIds }) => {
        assert.equal(transactionActive, true)
        assert.ok(events.includes('remove-job'))
        events.push(`start-retention:${documentIndexIds.join(',')}`)
      },
    },
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
    documentIndexLockQueries,
    transactionCount: () => transactionCount,
    createdIndexId: () => createdIndexId,
    queuedJobId: () => queuedJobId,
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
  assert.equal(result.jobId, request.queuedJobId())
  assert.equal(result.generation, '5')
  assert.equal(
    request.events.some((event) => event.startsWith('create-knowledgeBaseDocument:')),
    false,
  )
  assert.ok(request.events.indexOf('lock-document') < request.events.indexOf('lock-knowledgeBaseDocument'))
  assert.ok(request.events.indexOf('lock-knowledgeBaseDocument') < request.events.indexOf('lock-current-job'))
  assert.ok(request.events.indexOf('lock-current-job') < request.events.indexOf('lock-index:index-1'))
  assert.deepEqual(
    request.events.filter((event) => event.startsWith('lock-index:')),
    ['lock-index:index-1', 'lock-index:old-index'],
  )
  assert.ok(
    request.events.indexOf('update-knowledgeBaseDocument:5') < request.events.indexOf('enqueue-job:queued:0:true'),
  )
  assert.equal(request.events.filter((event) => event === 'enqueue-job:queued:0:true').length, 1)
  assert.ok(request.events.indexOf('enqueue-job:queued:0:true') < request.events.indexOf('start-retention:old-index'))
})

test('request indexing creates a missing knowledgeBaseDocument while holding the document lock and locks it again', async () => {
  const request = createRequestDocumentIndexScenario({ missingKnowledgeBaseDocument: true, isEntry: true })

  const result = await request.execute()

  assert.equal(result.generation, '1')
  assert.equal(request.transactionCount(), 1)
  assert.deepEqual(
    request.events.filter(
      (event) =>
        event === 'lock-document' ||
        event === 'lock-knowledgeBaseDocument' ||
        event.startsWith('create-knowledgeBaseDocument:'),
    ),
    [
      'lock-document',
      'lock-knowledgeBaseDocument',
      'create-knowledgeBaseDocument:0:null:false:false',
      'lock-knowledgeBaseDocument',
    ],
  )
  assert.ok(
    request.events.lastIndexOf('lock-knowledgeBaseDocument') <
      request.events.indexOf('update-knowledge-base-document-options'),
  )
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
  assert.equal(request.events.includes('lock-knowledgeBaseDocument'), false)
  assert.equal(request.events.includes('find-revision'), false)
  assert.equal(
    request.events.some((event) => event.startsWith('enqueue-job:')),
    false,
  )
})

test('request indexing stops when the newly created knowledgeBaseDocument cannot be locked', async () => {
  const request = createRequestDocumentIndexScenario({
    missingKnowledgeBaseDocument: true,
    unavailableKnowledgeBaseDocumentAfterCreate: true,
  })

  await assert.rejects(request.execute(), (error: unknown) => {
    assert.ok(error instanceof IndexRequestKnowledgeBaseDocumentUnavailableException)
    assert.equal(error.code, 'INDEX_REQUEST_MEMBERSHIP_UNAVAILABLE')

    return true
  })

  assert.equal(request.events.includes('update-knowledge-base-document-options'), false)
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

test('request indexing activates a ready index and retires the prior knowledgeBaseDocument target', async () => {
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
  assert.ok(request.events.includes('start-retention:old-index'))
  assert.equal(request.events.includes('enqueue-job'), false)
})

test('requesting a ready index starts retention for a cancelled building target with no prior active index', async () => {
  const request = createRequestDocumentIndexScenario({
    indexStatus: DocumentIndexStatusEnum.READY,
    activeDocumentIndexId: null,
    currentJob: {
      id: 'building-job',
      documentIndexId: 'building-index',
      generation: 4,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    },
  })

  const result = await request.execute()

  assert.equal(result.reusedReadyIndex, true)
  assert.ok(request.events.includes('start-retention:building-index'))
  assert.equal(
    request.events.some((event) => event.startsWith('enqueue-job:')),
    false,
  )
})

test('request indexing re-prepares after the target index disappears before its lock', async () => {
  const request = createRequestDocumentIndexScenario({ missingTargetLockAttempts: 1 })

  const result = await request.execute()

  assert.equal(request.transactionCount(), 2)
  assert.equal(result.jobId, request.queuedJobId())
  assert.equal(request.events.filter((event) => event === 'lock-index:index-1').length, 2)
  assert.equal(request.events.filter((event) => event.startsWith('enqueue-job:')).length, 1)
})

test('request indexing does not open a retry transaction until the gated target lock attempt finishes', async () => {
  let releaseFirstTargetLockAttempt: () => void = () => {}
  let signalFirstTargetLockAttempt: () => void = () => {}
  const firstTargetLockStarted = new Promise<void>((resolve) => {
    signalFirstTargetLockAttempt = resolve
  })
  const firstTargetLockGate = new Promise<void>((resolve) => {
    releaseFirstTargetLockAttempt = resolve
  })
  const request = createRequestDocumentIndexScenario({
    missingTargetLockAttempts: 1,
    beforeTargetLockAttempt: async (attempt) => {
      if (attempt !== 1) return

      signalFirstTargetLockAttempt()
      await firstTargetLockGate
    },
  })
  const pendingRequest = request.execute()

  await firstTargetLockStarted

  try {
    assert.equal(request.transactionCount(), 1)
    assert.deepEqual(
      request.events.filter((event) => event.startsWith('lock-index:')),
      ['lock-index:index-1'],
    )
  } finally {
    releaseFirstTargetLockAttempt()
  }

  const result = await pendingRequest

  assert.equal(result.jobId, request.queuedJobId())
  assert.equal(request.transactionCount(), 2)
  assert.equal(request.events.filter((event) => event === 'lock-index:index-1').length, 2)
})

test('request indexing stops re-preparation immediately when an attempt fails', async () => {
  const expectedError = new Error('target index lock failed')
  const request = createRequestDocumentIndexScenario({
    beforeTargetLockAttempt: async () => {
      throw expectedError
    },
  })

  await assert.rejects(request.execute(), (error: unknown) => error === expectedError)

  assert.equal(request.transactionCount(), 1)
  assert.deepEqual(
    request.events.filter((event) => event.startsWith('lock-index:')),
    ['lock-index:index-1'],
  )
  assert.equal(
    request.events.some((event) => event.startsWith('enqueue-job:')),
    false,
  )
})

test('request indexing locks duplicate target references once using their document-index ID', async () => {
  const request = createRequestDocumentIndexScenario({
    activeDocumentIndexId: 'index-1',
    currentJob: {
      id: 'same-target-job',
      documentIndexId: 'index-1',
      generation: 4,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
    },
  })

  await request.execute()

  assert.deepEqual(
    request.events.filter((event) => event.startsWith('lock-index:')),
    ['lock-index:index-1'],
  )
  assert.deepEqual(request.documentIndexLockQueries, [{ documentIndexId: 'index-1' }])
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

test('new target and queue inserts return the identities allocated by the request', async () => {
  const request = createRequestDocumentIndexScenario({ missingTargetIndex: true })
  const result = await request.execute()

  assert.ok(request.createdIndexId())
  assert.ok(request.queuedJobId())
  assert.equal(result.documentIndexId, request.createdIndexId())
  assert.equal(result.jobId, request.queuedJobId())
  assert.ok(request.events.includes(`lock-index:${request.createdIndexId()}`))
})
