import assert from 'node:assert/strict'
import test from 'node:test'

import { ProcessRagIndexJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/process-rag-index-job.use-case.js'
import { RagExecutionStageEnum } from '../../../src/Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { MarkdownChunkFactory } from '../../../src/Domain/Knowledge/markdown-chunk.factory.js'
import {
  type ClaimedRagIndexJob,
  type RagIndexingStore,
} from '../../../src/Infrastructure/Persistence/Repositories/Contracts/rag-indexing-store.js'

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

const createUseCase = (options: { failRenewal?: boolean } = {}) => {
  const renewalObserved = deferred<void>()
  const embeddingResult = deferred<number[][]>()
  const failed: unknown[] = []
  let heartbeatCount = 0
  let completeCount = 0

  const store = {
    claimNext: async () => claimedJob,
    heartbeat: async () => {
      heartbeatCount += 1

      if (heartbeatCount === 4) {
        renewalObserved.resolve()

        if (options.failRenewal) throw new Error('heartbeat failed')
      }
    },
    loadContent: async () => '# Title\nBody',
    savePlan: async () => undefined,
    complete: async () => {
      completeCount += 1
    },
    fail: async (_job: ClaimedRagIndexJob, error: unknown) => {
      failed.push(error)
    },
  } as unknown as RagIndexingStore
  const chunkPlanner = {
    plan: async (source: string) => MarkdownChunkFactory.plan(source),
    modelId: 'planner',
  }
  const embeddings = {
    embed: async () => embeddingResult.promise,
    modelId: 'embeddings',
  }

  return {
    useCase: new ProcessRagIndexJobUseCase(store, embeddings, chunkPlanner),
    renewalObserved: renewalObserved.promise,
    embeddingResult,
    failed,
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
})

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
