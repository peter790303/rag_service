import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { test } from 'node:test'

import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import 'reflect-metadata'
import { concatMap, firstValueFrom, from, toArray } from 'rxjs'

import type { DocumentIndexRequestResult } from '../../../src/DocumentIndexes/Application/DTOs/document-index-request.dto.ts'
import type { DocumentIndexingStatusDTO } from '../../../src/DocumentIndexes/Application/DTOs/document-indexing-status.dto.ts'
import type { RetryDocumentIndexingResultDTO } from '../../../src/DocumentIndexes/Application/DTOs/retry-document-indexing-result.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/DocumentIndexes/Application/Enums/document-index-execution-stage.enum.ts'
import { DocumentIndexingTargetStateEnum } from '../../../src/DocumentIndexes/Application/Enums/document-indexing-target-state.enum.ts'
import { DocumentIndexingRequestedEvent } from '../../../src/DocumentIndexes/Application/Events/document-indexing-requested.event.ts'
import { ActiveDocumentIndexExecutionPreventsRetryException } from '../../../src/DocumentIndexes/Application/Exceptions/active-document-index-execution-prevents-retry.exception.ts'
import { DocumentDisappearedBeforeIndexCompletionException } from '../../../src/DocumentIndexes/Application/Exceptions/document-disappeared-before-index-completion.exception.ts'
import { DocumentIndexingFailureAlreadyRetriedException } from '../../../src/DocumentIndexes/Application/Exceptions/document-indexing-failure-already-retried.exception.ts'
import { DocumentIndexingFailureNotCurrentException } from '../../../src/DocumentIndexes/Application/Exceptions/document-indexing-failure-not-current.exception.ts'
import { DocumentIndexingNotFoundException } from '../../../src/DocumentIndexes/Application/Exceptions/document-indexing-not-found.exception.ts'
import { IndexDisappearedBeforeCompletionException } from '../../../src/DocumentIndexes/Application/Exceptions/index-disappeared-before-completion.exception.ts'
import { IndexRetryRevisionUnavailableException } from '../../../src/DocumentIndexes/Application/Exceptions/index-retry-revision-unavailable.exception.ts'
import { IndexRetrySourceChangedException } from '../../../src/DocumentIndexes/Application/Exceptions/index-retry-source-changed.exception.ts'
import { IndexRetrySourceUnavailableException } from '../../../src/DocumentIndexes/Application/Exceptions/index-retry-source-unavailable.exception.ts'
import { InvalidIndexRetrySourceContextException } from '../../../src/DocumentIndexes/Application/Exceptions/invalid-index-retry-source-context.exception.ts'
import { PreparedIndexCollectedException } from '../../../src/DocumentIndexes/Application/Exceptions/prepared-index-collected.exception.ts'
import { StaleDocumentIndexingFailureException } from '../../../src/DocumentIndexes/Application/Exceptions/stale-document-indexing-failure.exception.ts'
import { DocumentIndexingRequestedListener } from '../../../src/DocumentIndexes/Application/Listeners/document-indexing-requested.listener.ts'
import { ReadDocumentIndexingStatusListener } from '../../../src/DocumentIndexes/Application/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../../src/DocumentIndexes/Application/Listeners/retry-document-indexing.listener.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { KnowledgeIndexPendingException } from '../../../src/DocumentIndexes/Domain/Exceptions/knowledge-index-pending.exception.ts'
import { DocumentIndexesController } from '../../../src/DocumentIndexes/Interfaces/Nest/Controllers/document-indexes.controller.ts'
import { IndexRequestDocumentUnavailableException } from '../../../src/Documents/Application/Exceptions/index-request-document-unavailable.exception.ts'
import { DocumentSourceTypeEnum } from '../../../src/Documents/Domain/Enums/document-source-type.enum.ts'
import { PruneKnowledgeBaseDocumentsCommandHandler } from '../../../src/KnowledgeBaseDocuments/Application/Commands/prune-knowledge-base-documents.command.handler.ts'
import { IndexRequestKnowledgeBaseDocumentUnavailableException } from '../../../src/KnowledgeBaseDocuments/Application/Exceptions/index-request-knowledge-base-document-unavailable.exception.ts'
import { KnowledgeBaseDocumentPruneConflictException } from '../../../src/KnowledgeBaseDocuments/Domain/Exceptions/knowledge-base-document-prune-conflict.exception.ts'
import { KnowledgeBaseDocumentsController } from '../../../src/KnowledgeBaseDocuments/Interfaces/Nest/Controllers/knowledge-base-documents.controller.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/KnowledgeBases/Application/Exceptions/knowledge-embedding-unavailable.exception.ts'
import { RetrieveKnowledgeBaseContentQueryHandler } from '../../../src/KnowledgeBases/Application/Queries/retrieve-knowledge-base-content.query.handler.ts'
import { DocumentReferenceResolutionAmbiguousException } from '../../../src/KnowledgeBases/Domain/Exceptions/document-reference-resolution-ambiguous.exception.ts'
import { KnowledgeBaseProjectMismatchException } from '../../../src/KnowledgeBases/Domain/Exceptions/knowledge-base-project-mismatch.exception.ts'
import { KnowledgeRetrievalIncompleteException } from '../../../src/KnowledgeBases/Domain/Exceptions/knowledge-retrieval-incomplete.exception.ts'
import { RequiredDocumentFullContentMissingException } from '../../../src/KnowledgeBases/Domain/Exceptions/required-document-full-content-missing.exception.ts'
import { KnowledgeBaseRetrievalController } from '../../../src/KnowledgeBases/Interfaces/Nest/Controllers/knowledge-base-retrieval.controller.ts'
import { ServiceAuthenticator } from '../../../src/Shared/Application/Ports/Out/Gateways/service-authenticator.ts'
import { HmacProjectServiceAuthenticator } from '../../../src/Shared/Infrastructure/Auth/hmac-project-service.authenticator.ts'
import { HealthController } from '../../../src/Shared/Interfaces/Nest/Controllers/health.controller.ts'
import { ApplicationErrorFilter } from '../../../src/Shared/Interfaces/Nest/ExceptionHandlers/application-error.filter.ts'
import { createGlobalValidationPipe } from '../../../src/Shared/Interfaces/Nest/Pipes/create-global-validation-pipe.ts'
import { createKnowledgeServiceConfigFixture } from '../../Support/knowledge-service-config.fixture.ts'
import { createRestoredKnowledgeBaseDocumentFixture } from '../../Unit/Application/document-index-lifecycle.fixture.ts'

let authenticated = true
let serviceError: Error | null = null
let onIndexingRequested: ((event: DocumentIndexingRequestedEvent) => Promise<void>) | null = null
const retrievalResponse = { matches: [], fullContentDocuments: [] }
const indexResponse: DocumentIndexRequestResult = {
  documentId: 'document-1',
  revisionId: 'revision-1',
  documentIndexId: 'index-1',
  jobId: null,
  generation: 'generation-1',
  reusedReadyIndex: true,
  blockedByFailedJob: false,
}
const retryResponse: RetryDocumentIndexingResultDTO = {
  jobId: 'job-2',
  failedJobId: 'failed-1',
  status: DocumentIndexingTargetStateEnum.QUEUED,
  retryOfFailedJobId: 'failed-1',
}
const pruneResponse = [
  createRestoredKnowledgeBaseDocumentFixture(),
  createRestoredKnowledgeBaseDocumentFixture({ documentId: 'document-2' }),
]
const validIndexBody = {
  knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
  projectId: 'project-1',
  projectName: 'Project',
  sourceType: DocumentSourceTypeEnum.REPOSITORY,
  sourceKey: 'repository-1',
  sourcePath: 'README.md',
  content: 'content',
}
const authSecret = 'http-contract-secret-that-is-at-least-32-characters'
const resultOrThrow = <T>(serviceResponseDTO: T): T => {
  if (serviceError !== null) throw serviceError

  return serviceResponseDTO
}
const useCaseProviders = [
  {
    provide: DocumentIndexingRequestedListener,
    useValue: {
      handle: async (event: DocumentIndexingRequestedEvent) => {
        await onIndexingRequested?.(event)

        return resultOrThrow(indexResponse)
      },
    },
  },
  { provide: RetrieveKnowledgeBaseContentQueryHandler, useValue: { execute: async () => resultOrThrow(null) } },
  { provide: ReadDocumentIndexingStatusListener, useValue: { handle: async () => resultOrThrow(jobStatusResponse) } },
  { provide: RetryDocumentIndexingListener, useValue: { handle: async () => resultOrThrow(retryResponse) } },
  {
    provide: PruneKnowledgeBaseDocumentsCommandHandler,
    useValue: { execute: async () => resultOrThrow(pruneResponse) },
  },
]
const readyAt = new Date('2026-10-14T00:00:00.000Z')
let jobStatusResponse: DocumentIndexingStatusDTO = {
  activeIndex: {
    id: 'index-1',
    status: DocumentIndexStatusEnum.READY,
    readyAt,
  },
  requestedTarget: {
    indexId: 'index-1',
    generation: 'generation-1',
    state: DocumentIndexingTargetStateEnum.RUNNING,
    jobId: 'job-1',
    failedJobId: null,
    attempts: 1,
    errorCode: null,
    errorMessage: null,
    executionVerification: {
      stage: DocumentIndexExecutionStageEnum.EMBEDDING,
      completedUnits: 2,
      totalUnits: 4,
      verifiedAt: null,
      leaseExpiresAt: null,
    },
  },
}

if (jobStatusResponse.activeIndex !== null) {
  Object.assign(jobStatusResponse.activeIndex, { internalIndexData: 'hidden' })
}

if (jobStatusResponse.requestedTarget !== null) {
  Object.assign(jobStatusResponse.requestedTarget, { internalTargetData: 'hidden' })

  if (jobStatusResponse.requestedTarget.executionVerification !== null) {
    Object.assign(jobStatusResponse.requestedTarget.executionVerification, {
      internalVerificationData: 'hidden',
    })
  }
}

Object.assign(jobStatusResponse, { internalStatusData: 'hidden' })

@Module({
  controllers: [
    HealthController,
    DocumentIndexesController,
    KnowledgeBaseRetrievalController,
    KnowledgeBaseDocumentsController,
  ],
  providers: [{ provide: ServiceAuthenticator, useValue: { authenticate: () => authenticated } }, ...useCaseProviders],
})
class HttpContractTestModule {}

@Module({
  controllers: [
    HealthController,
    DocumentIndexesController,
    KnowledgeBaseRetrievalController,
    KnowledgeBaseDocumentsController,
  ],
  providers: [
    {
      provide: ServiceAuthenticator,
      useValue: new HmacProjectServiceAuthenticator(
        createKnowledgeServiceConfigFixture({ serviceAuthSecret: authSecret }),
      ),
    },
    ...useCaseProviders,
  ],
})
class SignedHttpContractTestModule {}

const signedHeaders = (method: string, path: string, projectId: string, body: unknown = {}): Record<string, string> => {
  const issuedAt = String(Date.now())
  const payloadHash = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  const signature = createHmac('sha256', authSecret)
    .update([method, path, issuedAt, projectId, payloadHash].join('\n'))
    .digest('hex')

  return {
    'content-type': 'application/json',
    'x-rag-project-id': projectId,
    'x-rag-issued-at': issuedAt,
    'x-rag-signature': signature,
  }
}

test('HTTP contract returns 422 for invalid DTOs, 401 for failed auth, and 404 for unknown routes', async () => {
  const app = await NestFactory.create(HttpContractTestModule, { logger: false })
  app.useGlobalPipes(createGlobalValidationPipe())

  try {
    await app.listen(0, '127.0.0.1')
    const baseUrl = await app.getUrl()
    const invalidDTO = await fetch(`${baseUrl}/v1/index-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(invalidDTO.status, 422)

    const invalidSource = await fetch(`${baseUrl}/v1/index-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validIndexBody, sourceType: 'unsupported' }),
    })
    assert.equal(invalidSource.status, 422)

    let completeIndexingRequest!: () => void
    let receiveIndexingRequest!: (event: DocumentIndexingRequestedEvent) => void
    const indexingCompleted = new Promise<void>((resolve) => {
      completeIndexingRequest = resolve
    })
    const indexingReceived = new Promise<DocumentIndexingRequestedEvent>((resolve) => {
      receiveIndexingRequest = resolve
    })
    onIndexingRequested = async (event) => {
      receiveIndexingRequest(event)
      await indexingCompleted
    }
    let responded = false
    const response = fetch(`${baseUrl}/v1/index-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validIndexBody),
    }).then((result) => {
      responded = true

      return result
    })
    try {
      const event = await indexingReceived
      assert.ok(event instanceof DocumentIndexingRequestedEvent)
      assert.deepEqual(event.sourceDocument, { ...validIndexBody, payload: {} })
      assert.equal(responded, false)
      completeIndexingRequest()
      const reusedIndex = await response
      assert.equal(reusedIndex.status, 201)
      assert.deepEqual(await reusedIndex.json(), indexResponse)
    } finally {
      completeIndexingRequest()
      onIndexingRequested = null
    }

    const emptyQueryVector = await fetch(`${baseUrl}/v1/retrieve/hybrid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-1', queryText: 'query', queryVector: [] }),
    })
    assert.equal(emptyQueryVector.status, 422)

    const nullOptional = await fetch(`${baseUrl}/v1/retrieve/hybrid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-1', queryText: 'query', includeNonEffective: null }),
    })
    assert.equal(nullOptional.status, 422)

    const invalidJobId = await fetch(`${baseUrl}/v1/projects/project-1/jobs/not-a-uuid`)
    assert.equal(invalidJobId.status, 422)

    const jobStatus = await fetch(`${baseUrl}/v1/projects/project-1/jobs/11111111-1111-4111-8111-111111111111`)
    assert.equal(jobStatus.status, 200)
    assert.deepEqual(await jobStatus.json(), {
      activeIndex: {
        id: 'index-1',
        status: DocumentIndexStatusEnum.READY,
        readyAt: readyAt.toISOString(),
      },
      requestedTarget: {
        indexId: 'index-1',
        generation: 'generation-1',
        state: DocumentIndexingTargetStateEnum.RUNNING,
        jobId: 'job-1',
        failedJobId: null,
        attempts: 1,
        errorCode: null,
        errorMessage: null,
        executionVerification: {
          stage: DocumentIndexExecutionStageEnum.EMBEDDING,
          completedUnits: 2,
          totalUnits: 4,
          verifiedAt: null,
          leaseExpiresAt: null,
        },
      },
    })

    jobStatusResponse = { activeIndex: null, requestedTarget: null }
    const missingJobStatusDetails = await fetch(
      `${baseUrl}/v1/projects/project-1/jobs/11111111-1111-4111-8111-111111111111`,
    )
    assert.deepEqual(await missingJobStatusDetails.json(), {
      activeIndex: null,
      requestedTarget: null,
    })

    const invalidFailedJobId = await fetch(`${baseUrl}/v1/projects/project-1/failed-jobs/not-a-uuid/retry`, {
      method: 'POST',
    })
    assert.equal(invalidFailedJobId.status, 422)

    const retried = await fetch(
      `${baseUrl}/v1/projects/project-1/failed-jobs/11111111-1111-4111-8111-111111111111/retry`,
      { method: 'POST' },
    )
    assert.equal(retried.status, 201)
    assert.deepEqual(await retried.json(), retryResponse)

    const invalidKnowledgeBaseId = await fetch(`${baseUrl}/v1/knowledge-bases/not-a-uuid/memberships/prune`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-1', documentIds: [] }),
    })
    assert.equal(invalidKnowledgeBaseId.status, 422)

    const pruned = await fetch(`${baseUrl}/v1/knowledge-bases/11111111-1111-4111-8111-111111111111/memberships/prune`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-1', documentIds: ['document-1', 'document-2'] }),
    })
    assert.equal(pruned.status, 201)
    assert.deepEqual(await pruned.json(), { pruned: 2 })

    const retrieved = await fetch(`${baseUrl}/v1/retrieve/hybrid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-1', queryText: 'query' }),
    })
    assert.equal(retrieved.status, 201)
    assert.deepEqual(await retrieved.json(), retrievalResponse)

    authenticated = false
    const unauthorized = await fetch(`${baseUrl}/v1/index-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-1' }),
    })
    assert.equal(unauthorized.status, 401)

    const notFound = await fetch(`${baseUrl}/route-that-does-not-exist`)
    assert.equal(notFound.status, 404)
  } finally {
    authenticated = true
    await app.close()
  }
})

test('HTTP exposes typed application and domain error envelopes and keeps unexpected error details private', async () => {
  const app = await NestFactory.create(HttpContractTestModule, { logger: false })
  app.useGlobalPipes(createGlobalValidationPipe())
  app.useGlobalFilters(new ApplicationErrorFilter())

  try {
    await app.listen(0, '127.0.0.1')
    const baseUrl = await app.getUrl()
    const applicationErrors = [
      {
        error: new IndexRequestDocumentUnavailableException(),
        name: 'IndexRequestDocumentUnavailableException',
        code: 'INDEX_REQUEST_DOCUMENT_UNAVAILABLE',
        message: 'Document is no longer available',
      },
      {
        error: new IndexRequestKnowledgeBaseDocumentUnavailableException(),
        name: 'IndexRequestKnowledgeBaseDocumentUnavailableException',
        code: 'INDEX_REQUEST_MEMBERSHIP_UNAVAILABLE',
        message: 'Membership is no longer available',
      },
      {
        error: new PreparedIndexCollectedException(),
        name: 'PreparedIndexCollectedException',
        code: 'PREPARED_INDEX_COLLECTED',
        message: 'The prepared index was collected before it could be queued',
      },
      {
        error: new DocumentDisappearedBeforeIndexCompletionException(),
        name: 'DocumentDisappearedBeforeIndexCompletionException',
        code: 'DOCUMENT_DISAPPEARED_BEFORE_INDEX_COMPLETION',
        message: 'Document disappeared before completion',
      },
      {
        error: new IndexDisappearedBeforeCompletionException(),
        name: 'IndexDisappearedBeforeCompletionException',
        code: 'INDEX_DISAPPEARED_BEFORE_COMPLETION',
        message: 'Index disappeared before completion',
      },
      {
        error: new StaleDocumentIndexingFailureException(),
        name: 'StaleDocumentIndexingFailureException',
        code: 'STALE_DOCUMENT_INDEXING_FAILURE',
        message: 'Failed job is stale and cannot be manually retried',
      },
      {
        error: new DocumentIndexingFailureAlreadyRetriedException(),
        name: 'DocumentIndexingFailureAlreadyRetriedException',
        code: 'DOCUMENT_INDEXING_FAILURE_ALREADY_RETRIED',
        message: 'Failed job has already been retried',
      },
      {
        error: new ActiveDocumentIndexExecutionPreventsRetryException(),
        name: 'ActiveDocumentIndexExecutionPreventsRetryException',
        code: 'ACTIVE_DOCUMENT_INDEX_EXECUTION_PREVENTS_RETRY',
        message: 'Failed job is no longer retryable: active-job-exists',
      },
      {
        error: new DocumentIndexingFailureNotCurrentException(),
        name: 'DocumentIndexingFailureNotCurrentException',
        code: 'DOCUMENT_INDEXING_FAILURE_NOT_CURRENT',
        message: 'Failed job is no longer retryable: not-current',
      },
      {
        error: new IndexRetrySourceUnavailableException(),
        name: 'IndexRetrySourceUnavailableException',
        code: 'INDEX_RETRY_SOURCE_UNAVAILABLE',
        message: 'Current source is unavailable',
      },
      {
        error: new IndexRetryRevisionUnavailableException(),
        name: 'IndexRetryRevisionUnavailableException',
        code: 'INDEX_RETRY_REVISION_UNAVAILABLE',
        message: 'Current indexed source revision is unavailable',
      },
      {
        error: new InvalidIndexRetrySourceContextException(),
        name: 'InvalidIndexRetrySourceContextException',
        code: 'INVALID_INDEX_RETRY_SOURCE_CONTEXT',
        message: 'Failed job retry payload contains an invalid source context',
      },
      {
        error: new IndexRetrySourceChangedException(),
        name: 'IndexRetrySourceChangedException',
        code: 'INDEX_RETRY_SOURCE_CHANGED',
        message: 'Current source changed during retry',
      },
    ]

    applicationErrors.forEach(({ error, name, code, message }) => {
      assert.equal(error instanceof KnowledgeIndexPendingException, false)
      assert.equal(error.name, name)
      assert.equal(error.code, code)
      assert.equal(error.message, message)
    })

    const errors = [
      { error: new KnowledgeIndexPendingException(), status: 409 },
      { error: new KnowledgeBaseProjectMismatchException(), status: 409 },
      { error: new KnowledgeBaseDocumentPruneConflictException('kb-1', 'document-1'), status: 409 },
      { error: new DocumentIndexingNotFoundException('job-1'), status: 404 },
      { error: new KnowledgeEmbeddingUnavailableException(), status: 502 },
    ]

    const expectedErrors = [
      ...errors.map(({ error, status }) => ({ error, status, code: error.code, message: error.message })),
      ...applicationErrors.map((error) => ({ ...error, status: 409 })),
    ]

    const assertErrorResponse = async ({ error, status, code, message }: (typeof expectedErrors)[number]) => {
      serviceError = error
      const response = await fetch(`${baseUrl}/v1/retrieve/hybrid`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'project-1', queryText: 'query' }),
      })
      assert.equal(response.status, status)
      assert.deepEqual(await response.json(), { code, message })
    }

    await firstValueFrom(from(expectedErrors).pipe(concatMap(assertErrorResponse), toArray()))

    serviceError = new Error('internal database credential must not be returned')
    const unexpected = await fetch(`${baseUrl}/v1/retrieve/hybrid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-1', queryText: 'query' }),
    })
    assert.equal(unexpected.status, 500)
    assert.deepEqual(await unexpected.json(), { statusCode: 500, message: 'Internal server error' })
  } finally {
    serviceError = null
    await app.close()
  }
})

test('HTTP authenticates signed project scopes across body and route endpoints', async () => {
  const app = await NestFactory.create(SignedHttpContractTestModule, { logger: false })
  app.useGlobalPipes(createGlobalValidationPipe())

  try {
    await app.listen(0, '127.0.0.1')
    const baseUrl = await app.getUrl()
    const indexPath = '/v1/index-requests'
    const validIndex = await fetch(`${baseUrl}${indexPath}`, {
      method: 'POST',
      headers: signedHeaders('POST', indexPath, 'project-1', validIndexBody),
      body: JSON.stringify(validIndexBody),
    })
    assert.equal(validIndex.status, 201)

    const conflictingQuery = await fetch(`${baseUrl}${indexPath}?projectId=project-2`, {
      method: 'POST',
      headers: signedHeaders('POST', indexPath, 'project-1', validIndexBody),
      body: JSON.stringify(validIndexBody),
    })
    assert.equal(conflictingQuery.status, 401)

    const tamperedBody = await fetch(`${baseUrl}${indexPath}`, {
      method: 'POST',
      headers: signedHeaders('POST', indexPath, 'project-1', validIndexBody),
      body: JSON.stringify({ ...validIndexBody, content: 'tampered content' }),
    })
    assert.equal(tamperedBody.status, 401)

    const jobPath = '/v1/projects/project-1/jobs/11111111-1111-4111-8111-111111111111'
    const signedJob = await fetch(`${baseUrl}${jobPath}`, {
      headers: signedHeaders('GET', jobPath, 'project-1'),
    })
    assert.equal(signedJob.status, 200)

    const wrongScope = await fetch(`${baseUrl}${jobPath}`, {
      headers: signedHeaders('GET', jobPath, 'project-2'),
    })
    assert.equal(wrongScope.status, 401)

    const health = await fetch(`${baseUrl}/health`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { status: 'ok' })
  } finally {
    await app.close()
  }
})

test('HTTP retrieval incomplete errors preserve project authorization and return a bounded conflict response', async () => {
  const app = await NestFactory.create(SignedHttpContractTestModule, { logger: false })
  app.useGlobalPipes(createGlobalValidationPipe())
  app.useGlobalFilters(new ApplicationErrorFilter())

  try {
    await app.listen(0, '127.0.0.1')
    const baseUrl = await app.getUrl()
    const path = '/v1/retrieve/hybrid'
    const body = {
      projectId: 'worker-shared',
      queryText: '專案規範',
      documentReference: 'BackEnd/Agent-Teams/CONTEXT.md',
      topK: 5,
    }
    const errors = [
      new DocumentReferenceResolutionAmbiguousException({ matchingDocumentCount: 0 }),
      new DocumentReferenceResolutionAmbiguousException({ matchingDocumentCount: 2 }),
      new KnowledgeRetrievalIncompleteException(),
      new RequiredDocumentFullContentMissingException({ documentId: 'private-document-id' }),
    ]
    const assertIncompleteResponse = async (error: KnowledgeRetrievalIncompleteException) => {
      serviceError = error
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: signedHeaders('POST', path, body.projectId, body),
        body: JSON.stringify(body),
      })
      assert.equal(response.status, 409)
      assert.deepEqual(await response.json(), {
        code: 'KNOWLEDGE_RETRIEVAL_INCOMPLETE',
        message: 'Knowledge retrieval is missing required facts',
      })
    }
    await firstValueFrom(from(errors).pipe(concatMap(assertIncompleteResponse), toArray()))

    const wrongScope = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: signedHeaders('POST', path, 'other-project', body),
      body: JSON.stringify(body),
    })
    assert.equal(wrongScope.status, 401)
    assert.equal(JSON.stringify(await wrongScope.json()).includes('KNOWLEDGE_RETRIEVAL_INCOMPLETE'), false)

    const invalidBodies = [
      { ...body, topK: 0 },
      { ...body, topK: 101 },
      { ...body, limit: 0 },
      { ...body, limit: 101 },
    ]
    const assertInvalidLimit = async (invalidBody: (typeof invalidBodies)[number]) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: signedHeaders('POST', path, body.projectId, invalidBody),
        body: JSON.stringify(invalidBody),
      })
      assert.equal(response.status, 422)
    }
    await firstValueFrom(from(invalidBodies).pipe(concatMap(assertInvalidLimit), toArray()))
  } finally {
    serviceError = null
    await app.close()
  }
})
