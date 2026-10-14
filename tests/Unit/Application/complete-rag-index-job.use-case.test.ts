import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  RagIndexCompletionTransaction,
  RagIndexCompletionTransactionRepository,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-index-completion-transaction.js'
import type { ClaimedRagIndexJob } from '../../../src/Application/KnowledgeBases/DataTransferObjects/rag-index-job.dto.js'
import { CompleteRagIndexJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/complete-rag-index-job.use-case.js'
import { RagExecutionStageEnum } from '../../../src/Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { InvalidRagJobLeaseException } from '../../../src/Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'

const job: ClaimedRagIndexJob = {
  id: 'job-id',
  knowledgeBaseId: 'knowledge-base-id',
  documentId: 'document-id',
  documentIndexId: 'target-index-id',
  generation: '4',
  attempts: 1,
  leaseToken: 'lease-token',
  leaseExpiresAt: new Date('2026-10-14T00:01:00.000Z'),
  executionVerification: {
    stage: RagExecutionStageEnum.CLAIMED,
    completedUnits: 0,
    totalUnits: null,
    verifiedAt: null,
  },
}

const createUseCase = (requestedGeneration: number) => {
  const calls: string[] = []
  const transaction: RagIndexCompletionTransaction = {
    lockDocument: async () => {
      calls.push('lock-document')

      return true
    },
    lockMembership: async () => {
      calls.push('lock-membership')

      return { requestedGeneration, activeDocumentIndexId: 'previous-index-id' }
    },
    lockClaimedJob: async () => {
      calls.push('lock-job')
    },
    lockIndexesById: async (ids) => {
      calls.push('lock-indexes')

      return ids
    },
    markIndexReady: async () => {
      calls.push('mark-ready')
    },
    activateMembership: async () => {
      calls.push('activate-membership')
    },
    markIndexUnreferenced: async () => {
      calls.push('mark-previous-index-unreferenced')
    },
    removeClaimedJob: async () => {
      calls.push('remove-job')
    },
  }
  const repository: RagIndexCompletionTransactionRepository = {
    withCompletionTransaction: async (operation) => operation(transaction),
  }

  return { useCase: new CompleteRagIndexJobUseCase(repository), calls }
}

test('activates a ready index only after locking completion facts in order', async () => {
  const context = createUseCase(4)

  await context.useCase.execute(job, new Date('2026-10-14T00:00:30.000Z'))

  assert.deepEqual(context.calls, [
    'lock-document',
    'lock-membership',
    'lock-job',
    'lock-indexes',
    'mark-ready',
    'activate-membership',
    'mark-previous-index-unreferenced',
    'remove-job',
  ])
})

test('rejects a superseded generation without marking ready or deleting the job', async () => {
  const context = createUseCase(5)

  await assert.rejects(context.useCase.execute(job, new Date('2026-10-14T00:00:30.000Z')), InvalidRagJobLeaseException)

  assert.deepEqual(context.calls, ['lock-document', 'lock-membership'])
})
