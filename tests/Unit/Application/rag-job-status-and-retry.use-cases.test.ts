import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { GetRagJobStatusUseCase } from '../../../src/Application/KnowledgeBases/UseCases/get-rag-job-status.use-case.js'
import { RetryFailedRagJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retry-failed-rag-job.use-case.js'
import { RagExecutionStageEnum } from '../../../src/Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { RagJobTargetStateEnum } from '../../../src/Domain/Knowledge/Enums/rag-job-target-state.enum.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { calculateRagPipelineHash } from '../../../src/Domain/Knowledge/ValueObjects/rag-pipeline-hash.js'
import type { RetryContext } from '../../../src/Infrastructure/Persistence/Repositories/Contracts/rag-job-management.js'

const latestContent = '# Knowledge\n\nCurrent document content.'
const contentSha256 = createHash('sha256').update(latestContent).digest('hex')
const embeddingDimensions = 384
const embeddingModel = 'test-embedding-model'
const pipelineHash = calculateRagPipelineHash({
  contentSha256,
  embeddingModel,
  embeddingDimensions,
  chunkingModel: 'test-chunker',
  context: { source: 'original-request' },
})

const createRetryContext = (): RetryContext => ({
  failedJob: {
    id: 'failed-job',
    knowledgeBaseId: 'knowledge-base',
    documentId: 'document',
    documentIndexId: 'document-index',
    generation: 3,
    retryOfFailedJobId: null,
    retriedAt: null,
    retryPayload: { source: 'original-request' },
  },
  knowledgeBase: { id: 'knowledge-base', projectId: 'project-id' },
  document: { id: 'document', latestRevision: { id: 'revision', contentSha256, content: latestContent } },
  membership: { activeDocumentIndexId: 'old-index', requestedGeneration: 3 },
  documentIndex: {
    id: 'document-index',
    documentRevisionId: 'revision',
    pipelineHash,
    status: 'failed',
    readyAt: null,
  },
  activeJob: null,
  currentSource: {
    knowledgeBaseId: 'knowledge-base',
    projectId: 'project-id',
    projectName: 'project-id',
    sourceType: RagSourceTypeEnum.REPOSITORY,
    sourceKey: 'repository-key',
    sourcePath: 'docs/knowledge.md',
    title: 'Knowledge',
    content: latestContent,
    payload: { source: 'original-request' },
  },
})

test('job status preserves the currently active index separately from the requested target', async () => {
  const status = {
    activeIndex: { id: 'active-index', status: 'ready', readyAt: new Date('2026-01-01T00:00:00.000Z') },
    requestedTarget: {
      indexId: 'requested-index',
      generation: '3',
      state: RagJobTargetStateEnum.FAILED,
      jobId: null,
      failedJobId: 'failed-job',
      attempts: 4,
      errorCode: 'CHUNK_PLANNING_UNAVAILABLE',
      errorMessage: 'Planner unavailable',
      executionVerification: {
        stage: RagExecutionStageEnum.PLANNING,
        completedUnits: 0,
        totalUnits: null,
        verifiedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  }
  const useCase = new GetRagJobStatusUseCase({ jobStatus: async () => status } as never)

  assert.deepEqual(await useCase.execute('project-id', 'failed-job'), status)
})

test('manual retry requests an atomic retry and returns its queued job', async () => {
  const retryContext = createRetryContext()
  const atomicInputs: Record<string, unknown>[] = []
  const useCase = new RetryFailedRagJobUseCase(
    {
      readRetryContext: async () => retryContext,
      retryFailedJobAtomically: async (input: Record<string, unknown>) => {
        atomicInputs.push(input)

        return { status: 'retried', jobId: 'new-job' }
      },
    } as never,
    { modelId: embeddingModel } as never,
    { embeddingDimensions, chunkingModel: 'test-chunker' } as never,
    { execute: async () => assert.fail('fresh retry should not request a new index') } as never,
  )

  assert.deepEqual(await useCase.execute('project-id', 'failed-job'), {
    jobId: 'new-job',
    failedJobId: 'failed-job',
    status: 'queued',
    retryOfFailedJobId: 'failed-job',
  })
  assert.equal(atomicInputs.length, 1)
  assert.equal(atomicInputs[0]?.projectId, 'project-id')
  assert.equal(atomicInputs[0]?.expectedKnowledgeBaseId, 'knowledge-base')
  assert.equal(atomicInputs[0]?.expectedDocumentId, 'document')
  assert.equal(atomicInputs[0]?.expectedDocumentIndexId, 'document-index')
  assert.equal(atomicInputs[0]?.expectedGeneration, 3)
  assert.equal(atomicInputs[0]?.expectedRevisionId, 'revision')
  assert.equal(atomicInputs[0]?.expectedPipelineHash, pipelineHash)
})

test('manual retry requests indexing of the current source when the failed generation is stale', async () => {
  const retryContext = createRetryContext()

  if (!retryContext.membership) throw new Error('Retry context must include membership')

  retryContext.membership.requestedGeneration = 4
  const requestedSources: unknown[] = []
  let atomicRetryCalled = false
  const useCase = new RetryFailedRagJobUseCase(
    {
      readRetryContext: async () => retryContext,
      retryFailedJobAtomically: async () => {
        atomicRetryCalled = true

        return { status: 'retried', jobId: 'unexpected-job' }
      },
    } as never,
    { modelId: embeddingModel } as never,
    { embeddingDimensions, chunkingModel: 'test-chunker' } as never,
    {
      execute: async (source: unknown) => {
        requestedSources.push(source)

        return { jobId: 'current-job', blockedByFailedJob: false }
      },
    } as never,
  )

  assert.deepEqual(await useCase.execute('project-id', 'failed-job'), {
    jobId: 'current-job',
    failedJobId: 'failed-job',
    status: RagJobTargetStateEnum.QUEUED,
    retryOfFailedJobId: 'failed-job',
  })
  assert.equal(atomicRetryCalled, false)
  assert.deepEqual(requestedSources, [retryContext.currentSource])
})

test('manual retry rejects an active job even after its lease expires', async () => {
  const retryContext = createRetryContext()
  retryContext.activeJob = {
    id: 'active-job',
    status: 'running',
    leaseExpiresAt: new Date('2026-01-01T00:00:00.000Z'),
  }
  let atomicRetryCalled = false
  const useCase = new RetryFailedRagJobUseCase(
    {
      readRetryContext: async () => retryContext,
      retryFailedJobAtomically: async () => {
        atomicRetryCalled = true

        return { status: 'retried', jobId: 'unexpected-job' }
      },
    } as never,
    { modelId: embeddingModel } as never,
    { embeddingDimensions, chunkingModel: 'test-chunker' } as never,
    { execute: async () => assert.fail('active job should not trigger a new index') } as never,
  )

  await assert.rejects(useCase.execute('project-id', 'failed-job'))
  assert.equal(atomicRetryCalled, false)
})
