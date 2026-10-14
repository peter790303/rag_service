import assert from 'node:assert/strict'
import test from 'node:test'

import type { RagJobFailureTransaction } from '../../../src/Application/KnowledgeBases/Contracts/rag-indexing-repository.js'
import type {
  ClaimedRagIndexJobContract,
  RagFailedJobArchive,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'
import { FailRagIndexJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/fail-rag-index-job.use-case.js'
import { RagExecutionStageEnum } from '../../../src/Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { InvalidRagJobLeaseException } from '../../../src/Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'

const now = new Date('2026-10-14T00:00:30.000Z')
const job: ClaimedRagIndexJobContract = {
  id: 'job-id',
  knowledgeBaseId: 'base-id',
  documentId: 'document-id',
  documentIndexId: 'index-id',
  generation: '4',
  attempts: 4,
  leaseToken: 'token',
  leaseExpiresAt: new Date('2026-10-14T00:01:00.000Z'),
  executionVerification: {
    stage: RagExecutionStageEnum.CLAIMED,
    completedUnits: 0,
    totalUnits: null,
    verifiedAt: null,
  },
}

const createContext = (requestedGeneration = 4) => {
  const calls: string[] = []
  let archive: RagFailedJobArchive | null = null
  let retryState: Record<string, unknown> | null = null
  const transaction: RagJobFailureTransaction = {
    lockDocument: async () => {
      calls.push('document')

      return true
    },
    lockMembership: async () => {
      calls.push('membership')

      return { requestedGeneration }
    },
    lockClaimedJob: async (claimed) => {
      calls.push('claim')

      return { ...claimed, payload: { content: 'source' }, executionState: { completedUnits: 2 } }
    },
    lockIndex: async () => {
      calls.push('index')

      return true
    },
    queueRetry: async (_id, _availableAt, state) => {
      calls.push('retry')
      retryState = state
    },
    archiveFailedJob: async (value) => {
      calls.push('archive')
      archive = value
    },
    markIndexUnreferenced: async () => {
      calls.push('unreference')
    },
    removeClaimedJob: async () => {
      calls.push('delete-job')
    },
  }
  const useCase = new FailRagIndexJobUseCase({
    withFailureTransaction: async (operation) => {
      calls.push('begin')
      const result = await operation(transaction)
      calls.push('commit')

      return result
    },
  })

  return { useCase, calls, archive: () => archive, retryState: () => retryState }
}

test('archives the terminal failure before deleting the claim in the same transaction', async () => {
  const context = createContext()
  await context.useCase.execute(job, {
    errorCode: 'INDEXING_FAILED',
    errorMessage: 'failed',
    failedAt: now,
    retryAt: null,
  })
  assert.deepEqual(context.calls, [
    'begin',
    'document',
    'membership',
    'claim',
    'index',
    'archive',
    'unreference',
    'delete-job',
    'commit',
  ])
  assert.equal(context.archive()?.attempts, 4)
  assert.deepEqual(context.archive()?.retryPayload, {
    format: 'rag-v1',
    input: { content: 'source' },
    executionState: {
      completedUnits: 2,
      lastError: { code: 'INDEXING_FAILED', message: 'failed', failedAt: now.toISOString() },
    },
  })
})

test('retry keeps the claim history and execution progress without archiving or deleting', async () => {
  const context = createContext()
  await context.useCase.execute(
    { ...job, attempts: 1 },
    { errorCode: 'INDEXING_FAILED', errorMessage: 'failed', failedAt: now, retryAt: new Date(now.getTime() + 1000) },
  )
  assert.deepEqual(context.calls, ['begin', 'document', 'membership', 'claim', 'index', 'retry', 'commit'])
  assert.equal(context.retryState()?.completedUnits, 2)
  assert.equal(context.archive(), null)
})

test('rejects a superseded generation before changing retry or archive state', async () => {
  const context = createContext(5)
  await assert.rejects(
    context.useCase.execute(job, {
      errorCode: 'INDEXING_FAILED',
      errorMessage: 'failed',
      failedAt: now,
      retryAt: null,
    }),
    InvalidRagJobLeaseException,
  )
  assert.deepEqual(context.calls, ['begin', 'document', 'membership'])
})

test('the fourth attempt is archived even when a caller requests another retry', async () => {
  const context = createContext()
  await context.useCase.execute(job, {
    errorCode: 'INDEXING_FAILED',
    errorMessage: 'failed',
    failedAt: now,
    retryAt: new Date(now.getTime() + 1000),
  })
  assert.equal(context.archive()?.attempts, 4)
  assert.equal(context.retryState(), null)
  assert.deepEqual(context.calls.slice(-4), ['archive', 'unreference', 'delete-job', 'commit'])
})
