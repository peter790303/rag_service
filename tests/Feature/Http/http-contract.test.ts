import 'reflect-metadata'

import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { test } from 'node:test'

import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import type { RagConfig } from '../../../config/rag.config.js'
import { RagServiceAuthenticatorPort } from '../../../src/Application/KnowledgeBases/Contracts/rag-service-authenticator.js'
import type {
  RagIndexRequestResult,
  RagJobStatusDto,
  RetryFailedJobDto,
} from '../../../src/Application/KnowledgeBases/DataTransferObjects/rag.dto.js'
import { GetRagJobStatusUseCase } from '../../../src/Application/KnowledgeBases/UseCases/get-rag-job-status.use-case.js'
import { PruneRagMembershipsUseCase } from '../../../src/Application/KnowledgeBases/UseCases/prune-rag-memberships.use-case.js'
import { RequestRagIndexUseCase } from '../../../src/Application/KnowledgeBases/UseCases/request-rag-index.use-case.js'
import { RetrieveRagUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-rag.use-case.js'
import { RetryFailedRagJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retry-failed-rag-job.use-case.js'
import { RAG_DOCUMENT_INDEX_STATUS } from '../../../src/Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagExecutionStageEnum } from '../../../src/Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { RagJobTargetStateEnum } from '../../../src/Domain/Knowledge/Enums/rag-job-target-state.enum.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { KnowledgeBaseProjectMismatchException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-base-project-mismatch.exception.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { KnowledgeIndexPendingException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import { KnowledgeJobNotFoundException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-job-not-found.exception.js'
import { KnowledgeMembershipPruneConflictException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-membership-prune-conflict.exception.js'
import { RagServiceAuthenticator } from '../../../src/Infrastructure/Auth/rag-service-authenticator.js'
import { RagController } from '../../../src/Interfaces/Http/Controllers/rag.controller.js'
import { ApplicationErrorFilter } from '../../../src/Interfaces/Http/ExceptionHandlers/application-error.filter.js'
import { createGlobalValidationPipe } from '../../../src/Interfaces/Http/Pipes/create-global-validation-pipe.js'

let authenticated = true
let serviceError: Error | null = null
const retrievalResponse = { matches: [], fullContentDocuments: [] }
const indexResponse: RagIndexRequestResult = {
  documentId: 'document-1',
  revisionId: 'revision-1',
  documentIndexId: 'index-1',
  jobId: null,
  generation: 1,
  reusedReadyIndex: true,
  blockedByFailedJob: false,
}
const retryResponse: RetryFailedJobDto = {
  jobId: 'job-2',
  failedJobId: 'failed-1',
  status: RagJobTargetStateEnum.QUEUED,
  retryOfFailedJobId: 'failed-1',
}
const pruneResponse = { pruned: 2, internalData: 'hidden' }
const validIndexBody = {
  knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
  projectId: 'project-1',
  projectName: 'Project',
  sourceType: RagSourceTypeEnum.REPOSITORY,
  sourceKey: 'repository-1',
  sourcePath: 'README.md',
  content: 'content',
}
const authSecret = 'http-contract-secret-that-is-at-least-32-characters'
const resultOrThrow = <T>(result: T): T => {
  if (serviceError !== null) throw serviceError

  return result
}
const useCaseProviders = [
  { provide: RequestRagIndexUseCase, useValue: { execute: async () => resultOrThrow(indexResponse) } },
  { provide: RetrieveRagUseCase, useValue: { execute: async () => resultOrThrow(retrievalResponse) } },
  { provide: GetRagJobStatusUseCase, useValue: { execute: async () => resultOrThrow(jobStatusResponse) } },
  { provide: RetryFailedRagJobUseCase, useValue: { execute: async () => resultOrThrow(retryResponse) } },
  { provide: PruneRagMembershipsUseCase, useValue: { execute: async () => resultOrThrow(pruneResponse) } },
]
const readyAt = new Date('2026-10-14T00:00:00.000Z')
let jobStatusResponse: RagJobStatusDto = {
  activeIndex: {
    id: 'index-1',
    status: RAG_DOCUMENT_INDEX_STATUS.READY,
    readyAt,
  },
  requestedTarget: {
    indexId: 'index-1',
    generation: 'generation-1',
    state: RagJobTargetStateEnum.RUNNING,
    jobId: 'job-1',
    failedJobId: null,
    attempts: 1,
    errorCode: null,
    errorMessage: null,
    executionVerification: {
      stage: RagExecutionStageEnum.EMBEDDING,
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
  controllers: [RagController],
  providers: [
    { provide: RagServiceAuthenticatorPort, useValue: { authenticate: () => authenticated } },
    ...useCaseProviders,
  ],
})
class HttpContractTestModule {}

@Module({
  controllers: [RagController],
  providers: [
    {
      provide: RagServiceAuthenticatorPort,
      useValue: new RagServiceAuthenticator({ serviceAuthSecret: authSecret } as RagConfig),
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
    const invalidDto = await fetch(`${baseUrl}/v1/index-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(invalidDto.status, 422)

    const invalidSource = await fetch(`${baseUrl}/v1/index-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validIndexBody, sourceType: 'unsupported' }),
    })
    assert.equal(invalidSource.status, 422)

    const reusedIndex = await fetch(`${baseUrl}/v1/index-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validIndexBody),
    })
    assert.equal(reusedIndex.status, 201)
    assert.deepEqual(await reusedIndex.json(), indexResponse)

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
        status: RAG_DOCUMENT_INDEX_STATUS.READY,
        readyAt: readyAt.toISOString(),
      },
      requestedTarget: {
        indexId: 'index-1',
        generation: 'generation-1',
        state: RagJobTargetStateEnum.RUNNING,
        jobId: 'job-1',
        failedJobId: null,
        attempts: 1,
        errorCode: null,
        errorMessage: null,
        executionVerification: {
          stage: RagExecutionStageEnum.EMBEDDING,
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

test('HTTP exposes typed domain error envelopes and keeps unexpected error details private', async () => {
  const app = await NestFactory.create(HttpContractTestModule, { logger: false })
  app.useGlobalPipes(createGlobalValidationPipe())
  app.useGlobalFilters(new ApplicationErrorFilter())

  try {
    await app.listen(0, '127.0.0.1')
    const baseUrl = await app.getUrl()
    const errors = [
      { error: new KnowledgeIndexPendingException(), status: 409 },
      { error: new KnowledgeBaseProjectMismatchException(), status: 409 },
      { error: new KnowledgeMembershipPruneConflictException('kb-1', 'document-1'), status: 409 },
      { error: new KnowledgeJobNotFoundException('job-1'), status: 404 },
      { error: new KnowledgeEmbeddingUnavailableException(), status: 502 },
    ]

    for (const { error, status } of errors) {
      serviceError = error
      const response = await fetch(`${baseUrl}/v1/retrieve/hybrid`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'project-1', queryText: 'query' }),
      })
      assert.equal(response.status, status)
      assert.deepEqual(await response.json(), { code: error.code, message: error.message })
    }

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
