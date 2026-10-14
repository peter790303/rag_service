import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { RagIndexRequestAssembler } from '../../../src/Application/KnowledgeBases/Assemblers/rag-index-request.assembler.js'
import {
  RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS,
  type RetryContext,
  type RetryFailedJobAtomicallyInput,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-job-management.js'
import { GetRagJobStatusUseCase } from '../../../src/Application/KnowledgeBases/UseCases/get-rag-job-status.use-case.js'
import { RetryFailedRagJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retry-failed-rag-job.use-case.js'
import { RAG_DOCUMENT_INDEX_STATUS } from '../../../src/Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagExecutionStageEnum } from '../../../src/Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { RagJobTargetStateEnum } from '../../../src/Domain/Knowledge/Enums/rag-job-target-state.enum.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { KnowledgeIndexPendingException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import { KnowledgeJobNotFoundException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-job-not-found.exception.js'
import { RAG_JOB_STATUS } from '../../../src/Domain/Knowledge/rag-job.js'

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
const requestAssembler = new RagIndexRequestAssembler(pipelineSettings)
const pipelineHash = createHash('sha256')
  .update(
    requestAssembler.serializePipelineHashInput({
      contentSha256,
      embeddingModel,
      embeddingDimensions,
      chunkingModel: 'test-chunker',
      context: { source: 'original-request' },
    }),
  )
  .digest('hex')
const testCryptography = {
  sha256: (value: string) => createHash('sha256').update(value).digest('hex'),
  generateIdempotencyKey: () => 'retry-idempotency-key',
  generateLeaseToken: () => 'lease-token',
}

const createRetryContext = (): RetryContext => ({
  failedJob: {
    id: 'failed-job',
    knowledgeBaseId: 'knowledge-base',
    documentId: 'document',
    documentIndexId: 'document-index',
    generation: 3,
    attempts: 4,
    retryOfFailedJobId: null,
    retriedAt: null,
    retryPayload: { input: { source: 'original-request' }, executionState: null },
  },
  knowledgeBase: { id: 'knowledge-base', projectId: 'project-id' },
  document: {
    id: 'document',
    sourceType: RagSourceTypeEnum.REPOSITORY,
    sourceKey: 'repository-key',
    sourcePath: 'docs/knowledge.md',
    currentTitle: 'Knowledge',
    targetRevision: { id: 'revision', contentSha256, content: latestContent },
  },
  membership: { activeDocumentIndexId: 'old-index', requestedGeneration: 3 },
  documentIndex: {
    id: 'document-index',
    documentRevisionId: 'revision',
    pipelineHash,
    status: RAG_DOCUMENT_INDEX_STATUS.FAILED,
    readyAt: null,
  },
  activeJob: null,
})

test('job status assembles the target state from persisted facts in the application layer', async () => {
  const statusFacts = {
    activeIndex: {
      id: 'active-index',
      status: RAG_DOCUMENT_INDEX_STATUS.READY,
      readyAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    requestedTarget: {
      indexId: 'requested-index',
      generation: '3',
      targetStateFacts: {
        requestedGeneration: '3',
        targetGeneration: '3',
        activeJobStatus: null,
        hasFailedJob: true,
        targetIndexStatus: RAG_DOCUMENT_INDEX_STATUS.FAILED,
      },
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
  const useCase = new GetRagJobStatusUseCase({ jobStatus: async () => statusFacts } as never)

  const status = await useCase.execute('project-id', 'failed-job')

  assert.deepEqual(status.activeIndex, statusFacts.activeIndex)
  assert.equal(status.requestedTarget?.state, RagJobTargetStateEnum.FAILED)
  assert.deepEqual(status.requestedTarget, {
    indexId: 'requested-index',
    generation: '3',
    state: RagJobTargetStateEnum.FAILED,
    jobId: null,
    failedJobId: 'failed-job',
    attempts: 4,
    errorCode: 'CHUNK_PLANNING_UNAVAILABLE',
    errorMessage: 'Planner unavailable',
    executionVerification: statusFacts.requestedTarget.executionVerification,
  })
})

test('manual retry requests an atomic retry and returns its queued job', async () => {
  const retryContext = createRetryContext()
  retryContext.failedJob.retryPayload.executionState = {
    completedUnits: 2,
    lastError: { code: 'OLD_FAILURE' },
    claim_token: 'old-claim',
    lease_expires_at: '2026-01-01T00:00:00.000Z',
    leaseToken: 'old-lease',
    reservedAt: '2026-01-01T00:00:00.000Z',
    verifiedAt: '2026-01-01T00:00:00.000Z',
    executionVerification: { claim_token: 'old-claim' },
  }
  const originalExecutionState = structuredClone(retryContext.failedJob.retryPayload.executionState)
  const atomicInputs: RetryFailedJobAtomicallyInput[] = []
  const useCase = new RetryFailedRagJobUseCase(
    {
      readRetryContext: async (failedJobId: string) => {
        assert.equal(failedJobId, 'failed-job')

        return retryContext
      },
      retryFailedJobAtomically: async (input: RetryFailedJobAtomicallyInput) => {
        atomicInputs.push(input)

        return { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.RETRIED, jobId: 'new-job' }
      },
    } as never,
    { modelId: embeddingModel } as never,
    testCryptography,
    { embeddingDimensions, chunkingModel: 'test-chunker' } as never,
    requestAssembler,
  )

  assert.deepEqual(await useCase.execute('project-id', 'failed-job'), {
    jobId: 'new-job',
    failedJobId: 'failed-job',
    status: RagJobTargetStateEnum.QUEUED,
    retryOfFailedJobId: 'failed-job',
  })
  assert.equal(atomicInputs.length, 1)
  assert.deepEqual(atomicInputs[0], {
    projectId: 'project-id',
    failedJobId: 'failed-job',
    expected: {
      knowledgeBaseId: 'knowledge-base',
      documentId: 'document',
      documentIndexId: 'document-index',
      generation: 3,
      attempts: 4,
      retriedAt: null,
      sourceType: RagSourceTypeEnum.REPOSITORY,
      revisionId: 'revision',
      pipelineHash,
      membership: { requestedGeneration: 3, activeDocumentIndexId: 'old-index' },
      activeJobId: null,
    },
    retry: {
      status: RAG_JOB_STATUS.QUEUED,
      attempts: 0,
      payload: { source: 'original-request' },
      executionState: { completedUnits: 2 },
    },
    now: atomicInputs[0]?.now,
    idempotencyKey: 'retry-idempotency-key',
  })
  assert.ok(atomicInputs[0]?.now instanceof Date)
  assert.deepEqual(retryContext.failedJob.retryPayload.executionState, originalExecutionState)
})

test('manual retry preserves an empty source context when hashing and recreating the job', async () => {
  const retryContext = createRetryContext()
  retryContext.failedJob.retryPayload.input = {}
  const expectedPipelineHash = testCryptography.sha256(
    requestAssembler.serializePipelineHashInput({
      contentSha256,
      embeddingModel,
      embeddingDimensions,
      chunkingModel: 'test-chunker',
      context: undefined,
    }),
  )

  if (!retryContext.documentIndex) throw new Error('Retry context must include its current index')

  retryContext.documentIndex.pipelineHash = expectedPipelineHash
  let retryPayload: RetryFailedJobAtomicallyInput['retry'] | null = null
  let expectedHashFromUseCase: string | null = null
  const useCase = new RetryFailedRagJobUseCase(
    {
      readRetryContext: async (failedJobId: string) => {
        assert.equal(failedJobId, 'failed-job')

        return retryContext
      },
      retryFailedJobAtomically: async (input: RetryFailedJobAtomicallyInput) => {
        expectedHashFromUseCase = input.expected.pipelineHash
        retryPayload = input.retry

        return { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.RETRIED, jobId: 'new-job' }
      },
    } as never,
    { modelId: embeddingModel } as never,
    testCryptography,
    { embeddingDimensions, chunkingModel: 'test-chunker' } as never,
    requestAssembler,
  )

  await useCase.execute('project-id', 'failed-job')

  assert.equal(expectedHashFromUseCase, expectedPipelineHash)
  assert.deepEqual(retryPayload, {
    status: RAG_JOB_STATUS.QUEUED,
    attempts: 0,
    payload: {},
    executionState: null,
  })
})

test('manual retry treats a payload property as part of the source context', async () => {
  const retryContext = createRetryContext()
  const context = { payload: 'source metadata', source: 'original-request' }
  retryContext.failedJob.retryPayload.input = context
  const expectedPipelineHash = testCryptography.sha256(
    requestAssembler.serializePipelineHashInput({
      contentSha256,
      embeddingModel,
      embeddingDimensions,
      chunkingModel: 'test-chunker',
      context,
    }),
  )

  if (!retryContext.documentIndex) throw new Error('Retry context must include its current index')

  retryContext.documentIndex.pipelineHash = expectedPipelineHash
  const useCase = new RetryFailedRagJobUseCase(
    {
      readRetryContext: async () => retryContext,
      retryFailedJobAtomically: async (input: RetryFailedJobAtomicallyInput) => {
        assert.equal(input.expected.pipelineHash, expectedPipelineHash)
        assert.deepEqual(input.retry.payload, context)

        return { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.RETRIED, jobId: 'new-job' }
      },
    } as never,
    { modelId: embeddingModel } as never,
    testCryptography,
    { embeddingDimensions, chunkingModel: 'test-chunker' } as never,
    requestAssembler,
  )

  assert.equal((await useCase.execute('project-id', 'failed-job')).jobId, 'new-job')
})

test('manual retry rejects an invalid archived source context before the atomic mutation', async (t) => {
  await [null, [], 'invalid', 1].reduce(async (previousCase, invalidContext) => {
    await previousCase
    await t.test(JSON.stringify(invalidContext), async () => {
      const retryContext = createRetryContext()
      retryContext.failedJob.retryPayload.input = invalidContext as unknown as Record<string, unknown>
      let atomicRetryCalled = false
      const useCase = new RetryFailedRagJobUseCase(
        {
          readRetryContext: async () => retryContext,
          retryFailedJobAtomically: async () => {
            atomicRetryCalled = true

            return { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.RETRIED, jobId: 'new-job' }
          },
        } as never,
        { modelId: embeddingModel } as never,
        testCryptography,
        { embeddingDimensions, chunkingModel: 'test-chunker' } as never,
        requestAssembler,
      )

      await assert.rejects(useCase.execute('project-id', 'failed-job'), TypeError)
      assert.equal(atomicRetryCalled, false)
    })
  }, Promise.resolve())
})

test('manual retry rejects a stale failed generation without creating an ordinary index request', async () => {
  const retryContext = createRetryContext()

  if (!retryContext.membership) throw new Error('Retry context must include membership')

  retryContext.membership.requestedGeneration = 4
  let atomicRetryCalled = false
  const useCase = new RetryFailedRagJobUseCase(
    {
      readRetryContext: async (failedJobId: string) => {
        assert.equal(failedJobId, 'failed-job')

        return retryContext
      },
      retryFailedJobAtomically: async () => {
        atomicRetryCalled = true

        return { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.RETRIED, jobId: 'unexpected-job' }
      },
    } as never,
    { modelId: embeddingModel } as never,
    testCryptography,
    { embeddingDimensions, chunkingModel: 'test-chunker' } as never,
    requestAssembler,
  )

  await assert.rejects(useCase.execute('project-id', 'failed-job'))
  assert.equal(atomicRetryCalled, false)
})

test('manual retry rejects an active job even after its lease expires', async () => {
  const retryContext = createRetryContext()
  retryContext.activeJob = {
    id: 'active-job',
    status: RAG_JOB_STATUS.RUNNING,
  }
  let atomicRetryCalled = false
  const useCase = new RetryFailedRagJobUseCase(
    {
      readRetryContext: async (failedJobId: string) => {
        assert.equal(failedJobId, 'failed-job')

        return retryContext
      },
      retryFailedJobAtomically: async () => {
        atomicRetryCalled = true

        return { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.RETRIED, jobId: 'unexpected-job' }
      },
    } as never,
    { modelId: embeddingModel } as never,
    testCryptography,
    { embeddingDimensions, chunkingModel: 'test-chunker' } as never,
    requestAssembler,
  )

  await assert.rejects(useCase.execute('project-id', 'failed-job'))
  assert.equal(atomicRetryCalled, false)
})

test('manual retry hides a knowledge base from a different project before the atomic retry', async () => {
  const retryContext = createRetryContext()
  retryContext.knowledgeBase.projectId = 'another-project'
  let atomicRetryCalled = false
  const useCase = new RetryFailedRagJobUseCase(
    {
      readRetryContext: async (failedJobId: string) => {
        assert.equal(failedJobId, 'failed-job')

        return retryContext
      },
      retryFailedJobAtomically: async () => {
        atomicRetryCalled = true

        return { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.RETRIED, jobId: 'unexpected-job' }
      },
    } as never,
    { modelId: embeddingModel } as never,
    testCryptography,
    { embeddingDimensions, chunkingModel: 'test-chunker' } as never,
    requestAssembler,
  )

  await assert.rejects(useCase.execute('project-id', 'failed-job'), KnowledgeJobNotFoundException)
  assert.equal(atomicRetryCalled, false)
})

test('manual retry rejects nonterminal failures, consumed failures and changed pipelines', async (t) => {
  const cases: { name: string; change: (context: RetryContext) => void }[] = [
    { name: 'nonterminal attempts', change: (context) => (context.failedJob.attempts = 3) },
    {
      name: 'already retried',
      change: (context) => (context.failedJob.retriedAt = new Date()),
    },
    {
      name: 'changed pipeline',
      change: (context) => {
        if (context.documentIndex) context.documentIndex.pipelineHash = 'another-pipeline'
      },
    },
  ]

  for (const { name, change } of cases) {
    await t.test(name, async () => {
      const context = createRetryContext()
      change(context)
      let atomicCalls = 0
      const useCase = new RetryFailedRagJobUseCase(
        {
          readRetryContext: async () => context,
          retryFailedJobAtomically: async () => {
            atomicCalls += 1

            return { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.RETRIED, jobId: 'unexpected-job' }
          },
        } as never,
        { modelId: embeddingModel } as never,
        testCryptography,
        { embeddingDimensions, chunkingModel: 'test-chunker' } as never,
        requestAssembler,
      )

      await assert.rejects(useCase.execute('project-id', 'failed-job'), KnowledgeIndexPendingException)
      assert.equal(atomicCalls, 0)
    })
  }
})

test('manual retry maps conflicts discovered inside the atomic transaction', async (t) => {
  for (const status of [
    RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.STALE,
    RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.NOT_FOUND,
  ]) {
    await t.test(status, async () => {
      let atomicCalls = 0
      const useCase = new RetryFailedRagJobUseCase(
        {
          readRetryContext: async () => createRetryContext(),
          retryFailedJobAtomically: async () => {
            atomicCalls += 1

            return { status }
          },
        } as never,
        { modelId: embeddingModel } as never,
        testCryptography,
        { embeddingDimensions, chunkingModel: 'test-chunker' } as never,
        requestAssembler,
      )

      await assert.rejects(
        useCase.execute('project-id', 'failed-job'),
        status === RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.NOT_FOUND
          ? KnowledgeJobNotFoundException
          : KnowledgeIndexPendingException,
      )
      assert.equal(atomicCalls, 1)
    })
  }
})
