import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  createDocumentFixture,
  createJobRecordFixture,
  createRepositoryStub,
  createRestoredDocumentIndexFixture,
  createRestoredKnowledgeBaseDocumentFixture,
} from './document-index-lifecycle.fixture.ts'
import { WriteRequestDocumentIndexesAssembler } from '../../../src/DocumentIndexes/Application/Assemblers/write-request-document-indexes.assembler.ts'
import type { DocumentIndexExecutionRecordDTO } from '../../../src/DocumentIndexes/Application/DTOs/document-index-execution-record.dto.ts'
import type { DocumentIndexFailureRecordDTO } from '../../../src/DocumentIndexes/Application/DTOs/document-index-failure-record.dto.ts'
import type { DocumentIndexSuccessReceiptDTO } from '../../../src/DocumentIndexes/Application/DTOs/document-index-success-receipt.dto.ts'
import type { DocumentIndexingRetryContext } from '../../../src/DocumentIndexes/Application/DTOs/document-indexing-retry-context.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/DocumentIndexes/Application/Enums/document-index-execution-stage.enum.ts'
import { DocumentIndexingTargetStateEnum } from '../../../src/DocumentIndexes/Application/Enums/document-indexing-target-state.enum.ts'
import { ActiveDocumentIndexExecutionPreventsRetryException } from '../../../src/DocumentIndexes/Application/Exceptions/active-document-index-execution-prevents-retry.exception.ts'
import { DocumentIndexingFailureAlreadyRetriedException } from '../../../src/DocumentIndexes/Application/Exceptions/document-indexing-failure-already-retried.exception.ts'
import { DocumentIndexingFailureNotCurrentException } from '../../../src/DocumentIndexes/Application/Exceptions/document-indexing-failure-not-current.exception.ts'
import { DocumentIndexingNotFoundException } from '../../../src/DocumentIndexes/Application/Exceptions/document-indexing-not-found.exception.ts'
import { IndexRetrySourceChangedException } from '../../../src/DocumentIndexes/Application/Exceptions/index-retry-source-changed.exception.ts'
import { InvalidIndexRetrySourceContextException } from '../../../src/DocumentIndexes/Application/Exceptions/invalid-index-retry-source-context.exception.ts'
import { StaleDocumentIndexingFailureException } from '../../../src/DocumentIndexes/Application/Exceptions/stale-document-indexing-failure.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/DocumentIndexes/Application/Helpers/document-index-execution-lifecycle.helper.ts'
import { ReadDocumentIndexingStatusListener } from '../../../src/DocumentIndexes/Application/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../../src/DocumentIndexes/Application/Listeners/retry-document-indexing.listener.ts'
import type { EnqueueDocumentIndexingRetryParams } from '../../../src/DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.params.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import type { DocumentRevisionRepository } from '../../../src/DocumentRevisions/Application/Ports/Out/Repositories/document-revision.repository.ts'
import { GetDocumentRevisionForIndexRetryQueryHandler } from '../../../src/DocumentRevisions/Application/Queries/get-document-revision-for-index-retry.query.handler.ts'
import { DocumentRevision } from '../../../src/DocumentRevisions/Domain/Entities/document-revision.ts'
import { ReserveDocumentForIndexingCommandHandler } from '../../../src/Documents/Application/Commands/reserve-document-for-indexing.command.handler.ts'
import type { DocumentRepository } from '../../../src/Documents/Application/Ports/Out/Repositories/document.repository.ts'
import { GetDocumentForIndexRetryQueryHandler } from '../../../src/Documents/Application/Queries/get-document-for-index-retry.query.handler.ts'
import { DocumentSourceTypeEnum } from '../../../src/Documents/Domain/Enums/document-source-type.enum.ts'
import { ReserveKnowledgeBaseDocumentForIndexingCommandHandler } from '../../../src/KnowledgeBaseDocuments/Application/Commands/reserve-knowledge-base-document-for-indexing.command.handler.ts'
import type { KnowledgeBaseDocumentRepository } from '../../../src/KnowledgeBaseDocuments/Application/Ports/Out/Repositories/knowledge-base-document.repository.ts'
import { GetKnowledgeBaseDocumentIndexingStateQueryHandler } from '../../../src/KnowledgeBaseDocuments/Application/Queries/get-knowledge-base-document-indexing-state.query.handler.ts'
import type { KnowledgeBaseRepository } from '../../../src/KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base.repository.ts'
import { GetIndexingKnowledgeBaseQueryHandler } from '../../../src/KnowledgeBases/Application/Queries/get-indexing-knowledge-base.query.handler.ts'
import { KnowledgeBase } from '../../../src/KnowledgeBases/Domain/Entities/knowledge-base.ts'
import { createKnowledgeServiceConfigFixture } from '../../Support/knowledge-service-config.fixture.ts'

const latestContent = '# Knowledge\n\nCurrent document content.'
const contentSha256 = createHash('sha256').update(latestContent).digest('hex')
const embeddingDimensions = 384
const embeddingModel = 'test-embedding-model'
const pipelineSettings = {
  embeddingModel,
  embeddingDimensions,
  chunkingModel: 'test-chunker',
  chunkingProfile: 'test-chunker-profile',
  embeddingProfile: 'test-embedding-profile',
  lexicalProfile: 'test-lexical-profile',
  relationProfile: 'test-relation-profile',
}
const writeRequestDocumentIndexesAssembler = new WriteRequestDocumentIndexesAssembler(pipelineSettings)
const pipelineHash = createHash('sha256')
  .update(
    writeRequestDocumentIndexesAssembler.serializeDocumentIndexPipelineHashInput({
      contentSha256,
      embeddingModel,
      embeddingDimensions,
      chunkingModel: 'test-chunker',
      context: { source: 'original-request' },
    }),
  )
  .digest('hex')

const createRetryJobContextFixture = (): DocumentIndexingRetryContext => ({
  failedJob: {
    id: 'failed-job',
    knowledgeBaseId: 'knowledge-base',
    documentId: 'document',
    documentIndexId: 'document-index',
    generation: '3',
    attempts: 4,
    retryOfFailedJobId: null,
    retriedAt: null,
    retryPayload: { input: { source: 'original-request' }, executionState: null },
  },
  knowledgeBase: { id: 'knowledge-base', projectId: 'project-id' },
  document: {
    id: 'document',
    sourceType: DocumentSourceTypeEnum.REPOSITORY,
    sourceKey: 'repository-key',
    sourcePath: 'docs/knowledge.md',
    currentTitle: 'Knowledge',
    targetRevision: { id: 'revision', contentSha256, content: latestContent },
  },
  knowledgeBaseDocument: { activeDocumentIndexId: 'old-index', requestedGeneration: '3' },
  documentIndex: {
    id: 'document-index',
    documentRevisionId: 'revision',
    pipelineHash,
    status: DocumentIndexStatusEnum.FAILED,
    readyAt: null,
  },
  activeJob: null,
})

type StatusActiveJob = DocumentIndexExecutionRecordDTO
type StatusFailedJob = DocumentIndexFailureRecordDTO
const fixtureTimestamp = new Date('2026-01-01T00:00:00.000Z')

const createStatusActiveJob = (overrides: Partial<StatusActiveJob> = {}): StatusActiveJob => ({
  ...createJobRecordFixture(),
  id: 'active-job',
  knowledgeBaseId: 'knowledge-base',
  documentId: 'document',
  documentIndexId: 'requested-index',
  generation: '3',
  status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
  attempts: 2,
  executionVerification: {
    stage: DocumentIndexExecutionStageEnum.PLANNING,
    completedUnits: 0,
    totalUnits: null,
    verifiedAt: '2026-01-01T00:00:00.000Z',
    claim_token: 'lease-token',
    lease_expires_at: '2026-01-01T00:01:00.000Z',
  },
  ...overrides,
})

const createStatusFailedJob = (): StatusFailedJob => ({
  jobId: 'original-job',
  blockedReasons: [],
  retryPayload: {},
  failedAt: fixtureTimestamp,
  retriedAt: null,
  createdAt: fixtureTimestamp,
  updatedAt: fixtureTimestamp,
  id: 'failed-job',
  knowledgeBaseId: 'knowledge-base',
  documentId: 'document',
  documentIndexId: 'requested-index',
  generation: '3',
  attempts: 4,
  errorCode: 'CHUNK_PLANNING_UNAVAILABLE',
  errorMessage: 'Planner unavailable',
})

const createStatusSuccessReceipt = (
  overrides: Partial<DocumentIndexSuccessReceiptDTO> = {},
): DocumentIndexSuccessReceiptDTO => ({
  jobId: 'successful-job',
  projectId: 'project-id',
  knowledgeBaseId: 'knowledge-base',
  documentId: 'document',
  documentIndexId: 'requested-index',
  generation: '3',
  attempts: 1,
  executionVerification: null,
  completedAt: fixtureTimestamp,
  ...overrides,
})

const createStatusScenario = (
  activeJob: StatusActiveJob | null,
  failedJob: StatusFailedJob | null,
  knowledgeBaseDocument: { activeDocumentIndexId: string | null; requestedGeneration: string } | null = {
    activeDocumentIndexId: 'active-index',
    requestedGeneration: '3',
  },
  successReceipt: DocumentIndexSuccessReceiptDTO | null = null,
) => {
  type Dependencies = ConstructorParameters<typeof ReadDocumentIndexingStatusListener>
  const queries: unknown[] = []
  const jobRepository = createRepositoryStub<Dependencies[0]>({
    findExecutionInProject: async (jobInProjectQO: unknown) => {
      queries.push(['active-job', jobInProjectQO])

      return activeJob
    },
  })
  const knowledgeBaseDocumentRepository = createRepositoryStub<KnowledgeBaseDocumentRepository>({
    findByKnowledgeBaseIdAndDocumentId: async (knowledgeBaseDocumentSourceQO: unknown) => {
      queries.push(['knowledgeBaseDocument', knowledgeBaseDocumentSourceQO])

      return knowledgeBaseDocument === null
        ? null
        : createRestoredKnowledgeBaseDocumentFixture({
            knowledgeBaseId: 'knowledge-base',
            documentId: 'document',
            ...knowledgeBaseDocument,
          })
    },
  })
  const documentIndexRepository = createRepositoryStub<Dependencies[2]>({
    findByDocumentIndexId: async (documentIndexIdQO: { documentIndexId: string }) => {
      queries.push(['document-index', documentIndexIdQO])

      return createRestoredDocumentIndexFixture({
        id: documentIndexIdQO.documentIndexId,
        status:
          documentIndexIdQO.documentIndexId === 'active-index'
            ? DocumentIndexStatusEnum.READY
            : DocumentIndexStatusEnum.FAILED,
        readyAt: documentIndexIdQO.documentIndexId === 'active-index' ? new Date('2026-01-01T00:00:00.000Z') : null,
      })
    },
  })
  const failedJobRepository = createRepositoryStub<Dependencies[3]>({
    findFailureInProject: async (failedJobInProjectQO: unknown) => {
      queries.push(['failed-job', failedJobInProjectQO])

      return failedJob
    },
  })
  const successReceiptRepository = createRepositoryStub<Dependencies[4]>({
    findSuccessByProjectIdAndJobId: async (successByProjectIdAndJobIdQO: unknown) => {
      queries.push(['success-receipt', successByProjectIdAndJobIdQO])

      return successReceipt
    },
  })

  return {
    queries,
    useCase: new ReadDocumentIndexingStatusListener(
      jobRepository,
      new GetKnowledgeBaseDocumentIndexingStateQueryHandler(knowledgeBaseDocumentRepository),
      documentIndexRepository,
      failedJobRepository,
      successReceiptRepository,
    ),
  }
}

test('job status prefers the active job and reads its knowledgeBaseDocument and indexes through model ports', async () => {
  const { useCase, queries } = createStatusScenario(createStatusActiveJob(), createStatusFailedJob())

  const status = await useCase.handle({ projectId: 'project-id', jobId: 'active-job' })

  assert.deepEqual(queries, [
    ['active-job', { projectId: 'project-id', id: 'active-job' }],
    ['knowledgeBaseDocument', { knowledgeBaseId: 'knowledge-base', documentId: 'document' }],
    ['document-index', { documentIndexId: 'active-index' }],
  ])
  assert.deepEqual(status.activeIndex, {
    id: 'active-index',
    status: DocumentIndexStatusEnum.READY,
    readyAt: new Date('2026-01-01T00:00:00.000Z'),
  })
  assert.equal(status.requestedTarget?.state, DocumentIndexingTargetStateEnum.RUNNING)
  assert.equal(status.requestedTarget?.jobId, 'active-job')
  assert.equal(status.requestedTarget?.failedJobId, null)
  assert.equal(status.requestedTarget?.attempts, 2)
  assert.deepEqual(status.requestedTarget?.executionVerification, {
    stage: DocumentIndexExecutionStageEnum.PLANNING,
    completedUnits: 0,
    totalUnits: null,
    verifiedAt: '2026-01-01T00:00:00.000Z',
    claimToken: 'lease-token',
    leaseExpiresAt: '2026-01-01T00:01:00.000Z',
  })
})

test('job status falls back to the failed job only after the active job is absent', async () => {
  const { useCase, queries } = createStatusScenario(null, createStatusFailedJob(), {
    activeDocumentIndexId: null,
    requestedGeneration: '3',
  })

  const status = await useCase.handle({ projectId: 'project-id', jobId: 'failed-job' })

  assert.deepEqual(queries, [
    ['active-job', { projectId: 'project-id', id: 'failed-job' }],
    ['failed-job', { projectId: 'project-id', idOrJobId: 'failed-job' }],
    ['knowledgeBaseDocument', { knowledgeBaseId: 'knowledge-base', documentId: 'document' }],
  ])
  assert.equal(status.activeIndex, null)
  assert.deepEqual(status.requestedTarget, {
    indexId: 'requested-index',
    generation: '3',
    state: DocumentIndexingTargetStateEnum.FAILED,
    jobId: null,
    failedJobId: 'failed-job',
    attempts: 4,
    errorCode: 'CHUNK_PLANNING_UNAVAILABLE',
    errorMessage: 'Planner unavailable',
    executionVerification: null,
  })
})

test('job status reports a missing persisted job before reading its knowledgeBaseDocument or indexes', async () => {
  const { useCase, queries } = createStatusScenario(null, null)

  await assert.rejects(useCase.handle({ projectId: 'project-id', jobId: 'missing' }), DocumentIndexingNotFoundException)
  assert.deepEqual(queries, [
    ['active-job', { projectId: 'project-id', id: 'missing' }],
    ['failed-job', { projectId: 'project-id', idOrJobId: 'missing' }],
    ['success-receipt', { projectId: 'project-id', jobId: 'missing' }],
  ])
})

test('job status restores READY from a project-scoped receipt after the queue and target index are gone', async () => {
  const projectId = 'env-smoke-20261018-dc8d4592'
  const { useCase, queries } = createStatusScenario(
    null,
    null,
    { activeDocumentIndexId: null, requestedGeneration: '3' },
    createStatusSuccessReceipt({ projectId }),
  )

  const status = await useCase.handle({ projectId, jobId: 'successful-job' })

  assert.deepEqual(queries, [
    ['active-job', { projectId, id: 'successful-job' }],
    ['failed-job', { projectId, idOrJobId: 'successful-job' }],
    ['success-receipt', { projectId, jobId: 'successful-job' }],
    ['knowledgeBaseDocument', { knowledgeBaseId: 'knowledge-base', documentId: 'document' }],
  ])
  assert.equal(status.activeIndex, null)
  assert.equal(status.requestedTarget?.state, DocumentIndexingTargetStateEnum.READY)
  assert.equal(status.requestedTarget?.jobId, 'successful-job')
  assert.equal(status.requestedTarget?.indexId, 'requested-index')
})

test('job status preserves queued and superseded target decisions in the use case', async () => {
  const queued = createStatusScenario(createStatusActiveJob({ status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED }), null)
  const superseded = createStatusScenario(createStatusActiveJob(), null, {
    activeDocumentIndexId: null,
    requestedGeneration: '4',
  })
  const successfulButSuperseded = createStatusScenario(
    null,
    null,
    { activeDocumentIndexId: null, requestedGeneration: '4' },
    createStatusSuccessReceipt(),
  )
  const detached = createStatusScenario(null, createStatusFailedJob(), null)

  assert.equal(
    (await queued.useCase.handle({ projectId: 'project-id', jobId: 'active-job' })).requestedTarget?.state,
    DocumentIndexingTargetStateEnum.QUEUED,
  )
  assert.equal(
    (await superseded.useCase.handle({ projectId: 'project-id', jobId: 'active-job' })).requestedTarget?.state,
    DocumentIndexingTargetStateEnum.SUPERSEDED,
  )
  assert.equal(
    (await detached.useCase.handle({ projectId: 'project-id', jobId: 'failed-job' })).requestedTarget?.state,
    DocumentIndexingTargetStateEnum.SUPERSEDED,
  )
  assert.equal(
    (await successfulButSuperseded.useCase.handle({ projectId: 'project-id', jobId: 'successful-job' })).requestedTarget
      ?.state,
    DocumentIndexingTargetStateEnum.SUPERSEDED,
  )
})

test('job status does not fall back from an active job with an incomplete target identity', async () => {
  const { useCase, queries } = createStatusScenario(
    createStatusActiveJob({ documentIndexId: '' }),
    createStatusFailedJob(),
  )

  await assert.rejects(
    useCase.handle({ projectId: 'project-id', jobId: 'active-job' }),
    DocumentIndexingNotFoundException,
  )
  assert.deepEqual(queries, [['active-job', { projectId: 'project-id', id: 'active-job' }]])
})

test('job status omits malformed persisted execution verification', async () => {
  const { useCase } = createStatusScenario(
    createStatusActiveJob({
      executionVerification: { stage: 'unknown', completedUnits: 1, totalUnits: 2, verifiedAt: null },
    }),
    null,
  )

  assert.equal(
    (await useCase.handle({ projectId: 'project-id', jobId: 'active-job' })).requestedTarget?.executionVerification,
    null,
  )
})

const createRetryJobScenario = (
  context: DocumentIndexingRetryContext,
  options: {
    lockedContext?: () => DocumentIndexingRetryContext | null
    documentLocked?: boolean
    knowledgeBaseDocumentLocked?: boolean
    failedJobLocked?: boolean
    insertionError?: Error
  } = {},
) => {
  const events: string[] = []
  const queuedJobs: EnqueueDocumentIndexingRetryParams[] = []
  type Dependencies = ConstructorParameters<typeof RetryDocumentIndexingListener>
  let contextReads = 0
  let current: DocumentIndexingRetryContext | null = context
  const failedRecord = () => {
    if (current === null) return null

    return {
      ...createStatusFailedJob(),
      ...current.failedJob,
      generation: String(current.failedJob.generation),
      retryPayload: { format: 'rag-v1', ...current.failedJob.retryPayload },
    }
  }
  const documentRecord = () =>
    current?.document === null || current?.document === undefined ? null : createDocumentFixture(current.document)
  const knowledgeBaseDocumentRecord = () => {
    if (current?.knowledgeBaseDocument === null || current?.knowledgeBaseDocument === undefined) return null

    return createRestoredKnowledgeBaseDocumentFixture({
      knowledgeBaseId: 'knowledge-base',
      documentId: 'document',
      ...current.knowledgeBaseDocument,
      requestedGeneration: String(current.knowledgeBaseDocument.requestedGeneration),
    })
  }
  const persistenceTransaction = {
    runReadOnlySnapshot: async <T>(): Promise<T> => {
      throw new Error('Retry must use a write transaction')
    },
    run: async <T>(operation: () => Promise<T>) => {
      events.push('transaction')

      return operation()
    },
  }
  const knowledgeBaseRepository = createRepositoryStub<KnowledgeBaseRepository>({
    findByKnowledgeBaseId: async () =>
      current === null
        ? null
        : KnowledgeBase.create({
            ...current.knowledgeBase,
            projectName: 'Project',
            createdAt: fixtureTimestamp,
            updatedAt: fixtureTimestamp,
          }),
  })
  const documentRepository = createRepositoryStub<DocumentRepository>({
    findByDocumentId: async () => documentRecord(),
    lockByDocumentId: async (documentIdQO: { documentId: string }) => {
      const { documentId } = documentIdQO

      assert.equal(documentId, 'document')
      events.push('lock-document')

      return options.documentLocked === false ? null : documentRecord()
    },
  })
  const knowledgeBaseDocumentRepository = createRepositoryStub<KnowledgeBaseDocumentRepository>({
    findByKnowledgeBaseIdAndDocumentId: async () => knowledgeBaseDocumentRecord(),
    lockByKnowledgeBaseIdAndDocumentId: async (knowledgeBaseDocumentSourceQO: {
      knowledgeBaseId: string
      documentId: string
    }) => {
      assert.deepEqual(knowledgeBaseDocumentSourceQO, { knowledgeBaseId: 'knowledge-base', documentId: 'document' })
      events.push('lock-knowledgeBaseDocument')

      return options.knowledgeBaseDocumentLocked === false ? null : knowledgeBaseDocumentRecord()
    },
  })
  const documentRevisionRepository = createRepositoryStub<DocumentRevisionRepository>({
    findByDocumentRevisionIdAndDocumentId: async () => {
      const document = current?.document
      const revision = document?.targetRevision

      return document === null || document === undefined || revision === null || revision === undefined
        ? null
        : new DocumentRevision({
            ...revision,
            documentId: document.id,
            title: document.currentTitle,
            capturedAt: fixtureTimestamp,
            createdAt: fixtureTimestamp,
          })
    },
  })
  const documentIndexRepository = createRepositoryStub<Dependencies[5]>({
    findByDocumentIndexId: async () => {
      if (current?.documentIndex === null || current?.documentIndex === undefined) return null

      return createRestoredDocumentIndexFixture({
        ...current.documentIndex,
        revisionId: current.documentIndex.documentRevisionId,
      })
    },
  })
  const jobRepository = createRepositoryStub<Dependencies[6]>({
    findKnowledgeBaseDocumentExecution: async () =>
      current?.activeJob === null || current?.activeJob === undefined
        ? null
        : createJobRecordFixture(current.activeJob),
    enqueueRetry: async (createRetryJobQO: EnqueueDocumentIndexingRetryParams) => {
      events.push('create-job')

      if (options.insertionError !== undefined) throw options.insertionError

      queuedJobs.push(createRetryJobQO)
    },
  })
  const failedJobRepository = createRepositoryStub<Dependencies[7]>({
    findFailure: async (failedJobLookupQO: { id: string }) => {
      const { id } = failedJobLookupQO

      assert.equal(id, 'failed-job')
      contextReads += 1
      events.push('read-context')

      if (contextReads >= 3 && options.lockedContext !== undefined) current = options.lockedContext()

      return failedRecord()
    },
    lockFailure: async (failedJobIdQO: { failedJobId: string }) => {
      const { failedJobId } = failedJobIdQO

      assert.equal(failedJobId, 'failed-job')
      events.push('lock-failed-job')

      return options.failedJobLocked === false ? null : failedRecord()
    },
    removeFailure: async (failedJobIdQO: { failedJobId: string }) => {
      const { failedJobId } = failedJobIdQO

      assert.equal(failedJobId, 'failed-job')
      events.push('remove-failure')
    },
  })
  const useCase = new RetryDocumentIndexingListener(
    persistenceTransaction,
    new GetIndexingKnowledgeBaseQueryHandler(knowledgeBaseRepository),
    new GetDocumentForIndexRetryQueryHandler(documentRepository),
    new GetKnowledgeBaseDocumentIndexingStateQueryHandler(knowledgeBaseDocumentRepository),
    new GetDocumentRevisionForIndexRetryQueryHandler(documentRevisionRepository),
    documentIndexRepository,
    jobRepository,
    failedJobRepository,
    {
      modelId: embeddingModel,
      embed: async () => {
        throw new Error('Retry must not embed content')
      },
    },
    createKnowledgeServiceConfigFixture({ embeddingDimensions, chunkingModel: 'test-chunker' }),
    writeRequestDocumentIndexesAssembler,
    new ReserveDocumentForIndexingCommandHandler(documentRepository),
    new ReserveKnowledgeBaseDocumentForIndexingCommandHandler(knowledgeBaseDocumentRepository),
  )

  return { useCase, events, queuedJobs }
}

test('manual retry locks and compares the current target before queuing and marking the failure', async () => {
  const context = createRetryJobContextFixture()
  context.failedJob.retryPayload.executionState = {
    completedUnits: 2,
    lastError: { code: 'OLD_FAILURE' },
    claim_token: 'old-claim',
    claimToken: 'old-claim',
    lease_expires_at: '2026-01-01T00:00:00.000Z',
    leaseExpiresAt: '2026-01-01T00:00:00.000Z',
    leaseToken: 'old-lease',
    reservedAt: '2026-01-01T00:00:00.000Z',
    verifiedAt: '2026-01-01T00:00:00.000Z',
    executionVerification: { claim_token: 'old-claim' },
  }
  const originalExecutionState = structuredClone(context.failedJob.retryPayload.executionState)
  const retry = createRetryJobScenario(context)

  const result = await retry.useCase.handle({ projectId: 'project-id', failedJobId: 'failed-job' })
  assert.match(result.jobId ?? '', /^[0-9a-f-]{36}$/)
  assert.deepEqual(result, {
    jobId: retry.queuedJobs[0]?.id,
    failedJobId: 'failed-job',
    status: DocumentIndexingTargetStateEnum.QUEUED,
    retryOfFailedJobId: 'failed-job',
  })
  assert.deepEqual(retry.events, [
    'transaction',
    'read-context',
    'transaction',
    'read-context',
    'lock-document',
    'lock-knowledgeBaseDocument',
    'lock-failed-job',
    'read-context',
    'create-job',
    'remove-failure',
  ])
  assert.equal(retry.queuedJobs.length, 1)
  const queued = retry.queuedJobs[0]

  if (queued === undefined) throw new Error('Expected a queued retry')

  assert.deepEqual(queued, {
    id: result.jobId,
    knowledgeBaseId: 'knowledge-base',
    documentId: 'document',
    documentIndexId: 'document-index',
    generation: '3',
    status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
    attempts: 0,
    availableAt: queued.availableAt,
    reservedAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    idempotencyKey: queued.idempotencyKey,
    retryOfFailedJobId: null,
    payload: { source: 'original-request' },
    executionState: { completedUnits: 2 },
    executionVerification: null,
  })
  assert.ok(queued.availableAt instanceof Date)
  assert.match(queued.idempotencyKey ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.deepEqual(context.failedJob.retryPayload.executionState, originalExecutionState)
})

test('manual retry preserves empty context and a payload property as source metadata', async (t) => {
  const testCases = [{}, { payload: 'source metadata', source: 'original-request' }]
  await Promise.all(
    testCases.map((input) =>
      t.test(JSON.stringify(input), async () => {
        const context = createRetryJobContextFixture()
        context.failedJob.retryPayload.input = input

        if (context.documentIndex === null) throw new Error('Expected an index')

        context.documentIndex.pipelineHash = createHash('sha256')
          .update(
            writeRequestDocumentIndexesAssembler.serializeDocumentIndexPipelineHashInput({
              contentSha256,
              embeddingModel,
              embeddingDimensions,
              chunkingModel: 'test-chunker',
              context: input,
            }),
          )
          .digest('hex')
        const retry = createRetryJobScenario(context)

        await retry.useCase.handle({ projectId: 'project-id', failedJobId: 'failed-job' })

        assert.deepEqual(retry.queuedJobs[0]?.payload, input)
        assert.equal(retry.queuedJobs[0]?.executionState, null)
      }),
    ),
  )
})

test('manual retry rejects invalid archived context before the mutation transaction', async (t) => {
  const testCases = [null, [], 'invalid', 1, false, undefined]
  await Promise.all(
    testCases.map((input) =>
      t.test(JSON.stringify(input) ?? 'undefined', async () => {
        const context = createRetryJobContextFixture()
        context.failedJob.retryPayload.input = input as unknown as Record<string, unknown>
        const retry = createRetryJobScenario(context)

        await assert.rejects(retry.useCase.handle({ projectId: 'project-id', failedJobId: 'failed-job' }), {
          name: InvalidIndexRetrySourceContextException.name,
          code: 'INVALID_INDEX_RETRY_SOURCE_CONTEXT',
        })
        assert.deepEqual(retry.events, ['transaction', 'read-context'])
        assert.deepEqual(retry.queuedJobs, [])
        assert.equal(context.failedJob.retriedAt, null)
      }),
    ),
  )
})

test('manual retry rejects stale, active, consumed and nonterminal targets before mutation', async (t) => {
  const cases: {
    name: string
    change: (context: DocumentIndexingRetryContext) => void
    exception: new () => Error
    code: string
  }[] = [
    {
      name: 'nonterminal attempts',
      exception: DocumentIndexingFailureNotCurrentException,
      code: 'DOCUMENT_INDEXING_FAILURE_NOT_CURRENT',
      change: (context) => {
        context.failedJob.attempts = 3
      },
    },
    {
      name: 'already retried',
      exception: DocumentIndexingFailureAlreadyRetriedException,
      code: 'DOCUMENT_INDEXING_FAILURE_ALREADY_RETRIED',
      change: (context) => {
        context.failedJob.retriedAt = new Date()
      },
    },
    {
      name: 'changed pipeline',
      exception: StaleDocumentIndexingFailureException,
      code: 'STALE_DOCUMENT_INDEXING_FAILURE',
      change: (context) => {
        if (context.documentIndex !== null) context.documentIndex.pipelineHash = 'changed'
      },
    },
    {
      name: 'stale generation',
      exception: StaleDocumentIndexingFailureException,
      code: 'STALE_DOCUMENT_INDEXING_FAILURE',
      change: (context) => {
        if (context.knowledgeBaseDocument !== null) context.knowledgeBaseDocument.requestedGeneration = '4'
      },
    },
    {
      name: 'active job with expired lease',
      exception: ActiveDocumentIndexExecutionPreventsRetryException,
      code: 'ACTIVE_DOCUMENT_INDEX_EXECUTION_PREVENTS_RETRY',
      change: (context) => {
        context.activeJob = { id: 'active-job', status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING }
      },
    },
    {
      name: 'initial source unavailable',
      exception: DocumentIndexingFailureNotCurrentException,
      code: 'DOCUMENT_INDEXING_FAILURE_NOT_CURRENT',
      change: (context) => {
        context.document = null
      },
    },
    {
      name: 'initial revision unavailable',
      exception: DocumentIndexingFailureNotCurrentException,
      code: 'DOCUMENT_INDEXING_FAILURE_NOT_CURRENT',
      change: (context) => {
        assert.ok(context.document)
        context.document.targetRevision = null
      },
    },
  ]

  const testCases = cases
  await Promise.all(
    testCases.map(({ name, change, exception, code }) =>
      t.test(name, async () => {
        const context = createRetryJobContextFixture()
        change(context)
        const originalRetriedAt = context.failedJob.retriedAt
        const retry = createRetryJobScenario(context)

        await assert.rejects(
          retry.useCase.handle({ projectId: 'project-id', failedJobId: 'failed-job' }),
          (error: unknown) => {
            assert.ok(error instanceof exception)
            assert.equal(error.name, exception.name)
            assert.equal((error as Error & { code: string }).code, code)

            return true
          },
        )
        assert.deepEqual(retry.events, ['transaction', 'read-context'])
        assert.deepEqual(retry.queuedJobs, [])
        assert.equal(context.failedJob.retriedAt, originalRetriedAt)
      }),
    ),
  )
})

test('manual retry hides a failure in another project before locking', async () => {
  const context = createRetryJobContextFixture()
  context.knowledgeBase.projectId = 'another-project'
  const retry = createRetryJobScenario(context)

  await assert.rejects(
    retry.useCase.handle({ projectId: 'project-id', failedJobId: 'failed-job' }),
    DocumentIndexingNotFoundException,
  )
  assert.deepEqual(retry.events, ['transaction', 'read-context'])
})

test('manual retry compares fresh facts under all locks before any insert', async (t) => {
  const cases: { name: string; change: (context: DocumentIndexingRetryContext) => void }[] = [
    {
      name: 'active job inserted',
      change: (context) => {
        context.activeJob = { id: 'active-job', status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED }
      },
    },
    {
      name: 'failure consumed concurrently',
      change: (context) => {
        context.failedJob.retriedAt = new Date()
      },
    },
    {
      name: 'knowledgeBaseDocument moved',
      change: (context) => {
        if (context.knowledgeBaseDocument !== null) context.knowledgeBaseDocument.activeDocumentIndexId = 'changed'
      },
    },
    {
      name: 'requested generation moved',
      change: (context) => {
        if (context.knowledgeBaseDocument !== null) context.knowledgeBaseDocument.requestedGeneration = '4'
      },
    },
    {
      name: 'target revision moved',
      change: (context) => {
        if (context.document?.targetRevision !== null && context.document !== null)
          context.document.targetRevision.id = 'changed'
      },
    },
    {
      name: 'pipeline changed',
      change: (context) => {
        if (context.documentIndex !== null) context.documentIndex.pipelineHash = 'changed'
      },
    },
    {
      name: 'attempts changed',
      change: (context) => {
        context.failedJob.attempts = 3
      },
    },
    {
      name: 'target revision disappeared under lock',
      change: (context) => {
        assert.ok(context.document)
        context.document.targetRevision = null
      },
    },
  ]

  const testCases = cases
  await Promise.all(
    testCases.map(({ name, change }) =>
      t.test(name, async () => {
        const current = createRetryJobContextFixture()
        change(current)
        const retry = createRetryJobScenario(createRetryJobContextFixture(), { lockedContext: () => current })

        await assert.rejects(
          retry.useCase.handle({ projectId: 'project-id', failedJobId: 'failed-job' }),
          (error: unknown) => {
            assert.ok(error instanceof IndexRetrySourceChangedException)
            assert.equal(error.code, 'INDEX_RETRY_SOURCE_CHANGED')

            return true
          },
        )
        assert.ok(retry.events.includes('lock-failed-job'))
        assert.equal(retry.events.filter((event) => event === 'read-context').length, 3)
        assert.equal(retry.events.includes('create-job'), false)
        assert.equal(retry.events.includes('remove-failure'), false)
        assert.deepEqual(retry.queuedJobs, [])
      }),
    ),
  )
})

test('manual retry treats deleted lock targets and failures as conflicts without insertion', async (t) => {
  const testCases = [
    { documentLocked: false },
    { knowledgeBaseDocumentLocked: false },
    { failedJobLocked: false },
    { lockedContext: () => null },
  ]
  await Promise.all(
    testCases.map((options) =>
      t.test(JSON.stringify(options), async () => {
        const retry = createRetryJobScenario(createRetryJobContextFixture(), options)
        const missingFailure = options.failedJobLocked === false || options.lockedContext !== undefined

        await assert.rejects(
          retry.useCase.handle({ projectId: 'project-id', failedJobId: 'failed-job' }),
          missingFailure ? DocumentIndexingNotFoundException : IndexRetrySourceChangedException,
        )
        assert.equal(retry.events.includes('create-job'), false)

        if (options.documentLocked === false) assert.equal(retry.events.includes('lock-knowledgeBaseDocument'), false)
      }),
    ),
  )
})

test('manual retry propagates insertion failure without consuming the failure', async () => {
  const retry = createRetryJobScenario(createRetryJobContextFixture(), {
    insertionError: new Error('insert failed'),
  })

  await assert.rejects(retry.useCase.handle({ projectId: 'project-id', failedJobId: 'failed-job' }), /insert failed/)
  assert.equal(retry.events.includes('remove-failure'), false)
})
