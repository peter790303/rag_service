import assert from 'node:assert/strict'
import test from 'node:test'

import type { RagIndexProcessingRepository } from '../../../src/Application/KnowledgeBases/Contracts/rag-indexing-repository.js'
import { type ClaimedRagIndexJob } from '../../../src/Application/KnowledgeBases/DataTransferObjects/rag-index-job.dto.js'
import { ProcessRagIndexJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/process-rag-index-job.use-case.js'
import { RagExecutionStageEnum } from '../../../src/Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { MarkdownChunkFactory, type MarkdownPlan } from '../../../src/Domain/Knowledge/markdown-chunk.factory.js'

const claimedJob: ClaimedRagIndexJob = {
  id: 'job',
  knowledgeBaseId: 'kb',
  documentId: 'document',
  documentIndexId: 'index',
  generation: '1',
  attempts: 1,
  leaseToken: 'lease-token',
  leaseExpiresAt: new Date(Date.now() + 120),
  executionVerification: {
    stage: RagExecutionStageEnum.CLAIMED,
    completedUnits: 0,
    totalUnits: null,
    verifiedAt: null,
  },
}

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

const createUseCase = (options: { blockLoading?: boolean; failRenewal?: boolean } = {}) => {
  const renewalObserved = deferred<void>()
  const loadingStarted = deferred<void>()
  const loadingResult = deferred<string>()
  const embeddingResult = deferred<number[][]>()
  const failed: unknown[] = []
  const savedPlans: Array<{ vectors: number[][]; lexicalSearchTexts: string[] }> = []
  let heartbeatCount = 0
  let completeCount = 0

  const store = {
    heartbeat: async () => {
      heartbeatCount += 1

      if (heartbeatCount === 4) {
        renewalObserved.resolve()

        if (options.failRenewal) throw new Error('heartbeat failed')
      }
    },
    loadContent: async () => {
      loadingStarted.resolve()

      return options.blockLoading ? loadingResult.promise : '# Title\nBody'
    },
  } as unknown as RagIndexProcessingRepository
  const failIndexJob = {
    execute: async (job: ClaimedRagIndexJob, error: unknown) => {
      assert.equal(job, claimedJob)
      failed.push(error)
    },
  }
  const replaceIndexPlan = {
    execute: async (
      _job: ClaimedRagIndexJob,
      plan: MarkdownPlan,
      vectors: number[][],
      lexicalSearchTexts: string[],
    ) => {
      savedPlans.push({ vectors, lexicalSearchTexts })
      assert.equal(lexicalSearchTexts.length, plan.chunks.length)
    },
  }
  const chunkPlanner = {
    plan: async (source: string) => MarkdownChunkFactory.plan(source),
    modelId: 'planner',
  }
  const embeddings = {
    embed: async () => embeddingResult.promise,
    modelId: 'embeddings',
  }
  const claimNextJob = { execute: async () => claimedJob }
  const completeIndexJob = {
    execute: async (job: ClaimedRagIndexJob) => {
      assert.equal(job, claimedJob)
      assert.equal(savedPlans.length, 1, 'completion must follow plan persistence')
      completeCount += 1
    },
  }
  const lexicalFormatter = {
    format: (text: string) => ({ profileVersion: 'test-profile', terms: [text], searchText: `normalized:${text}` }),
  }

  return {
    useCase: new ProcessRagIndexJobUseCase(
      store,
      replaceIndexPlan,
      completeIndexJob,
      claimNextJob,
      failIndexJob,
      embeddings,
      chunkPlanner,
      lexicalFormatter,
      30,
    ),
    renewalObserved: renewalObserved.promise,
    loadingStarted: loadingStarted.promise,
    loadingResult,
    embeddingResult,
    failed,
    savedPlans,
    get heartbeatCount() {
      return heartbeatCount
    },
    get completeCount() {
      return completeCount
    },
  }
}

test('renews the lease while waiting for a long embedding request', { timeout: 1000 }, async () => {
  const context = createUseCase()
  const execution = context.useCase.execute()

  await context.renewalObserved
  assert.equal(context.heartbeatCount, 4)

  context.embeddingResult.resolve([[0.1]])
  await execution

  assert.equal(context.completeCount, 1)
  assert.deepEqual(context.failed, [])
  assert.deepEqual(context.savedPlans, [
    {
      vectors: [[0.1]],
      lexicalSearchTexts: MarkdownChunkFactory.plan('# Title\nBody').chunks.map(
        (chunk) => `normalized:${chunk.content}`,
      ),
    },
  ])
})

test('rejects an incomplete embedding result before persisting the planned chunks', async () => {
  const context = createUseCase()
  const execution = context.useCase.execute()

  await context.renewalObserved
  context.embeddingResult.resolve([])
  await execution

  assert.deepEqual(context.savedPlans, [])
  assert.equal(context.completeCount, 0)
  assert.equal(context.failed.length, 1)
  assert.equal((context.failed[0] as { errorMessage: string }).errorMessage, 'Knowledge embedding is unavailable')
})

test(
  'keeps the renewal interval stable when an earlier phase outlives the original lease',
  { timeout: 1000 },
  async () => {
    const context = createUseCase({ blockLoading: true })
    const execution = context.useCase.execute()

    await context.loadingStarted
    await new Promise((resolve) => setTimeout(resolve, 140))
    context.loadingResult.resolve('# Title\nBody')
    await context.renewalObserved

    const heartbeatCountAtEmbeddingStart = context.heartbeatCount
    await new Promise((resolve) => setTimeout(resolve, 25))
    const heartbeatsDuringEmbedding = context.heartbeatCount - heartbeatCountAtEmbeddingStart

    assert.ok(heartbeatsDuringEmbedding < 10, `expected a bounded heartbeat cadence, got ${heartbeatsDuringEmbedding}`)

    context.embeddingResult.resolve([[0.1]])
    await execution
    assert.deepEqual(context.failed, [])
  },
)

test('fails the claimed job when lease renewal fails during an embedding request', { timeout: 1000 }, async () => {
  const context = createUseCase({ failRenewal: true })
  const execution = context.useCase.execute()

  await context.renewalObserved
  await new Promise((resolve) => setTimeout(resolve, 10))
  context.embeddingResult.resolve([[0.1]])
  await execution

  assert.equal(context.completeCount, 0)
  assert.equal(context.failed.length, 1)
  assert.equal((context.failed[0] as { errorMessage: string }).errorMessage, 'RAG indexing failed')
})
