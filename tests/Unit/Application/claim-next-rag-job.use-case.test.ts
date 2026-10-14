import assert from 'node:assert/strict'
import test from 'node:test'

import type { RagCryptographyProvider } from '../../../src/Application/KnowledgeBases/Contracts/rag-cryptography-provider.js'
import type { RagJobClaimTransactionBoundary } from '../../../src/Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'
import type {
  ExpiredRagJob,
  RagJobClaim,
  RagJobClaimCandidate,
  RagJobClaimTransaction,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'
import { RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS } from '../../../src/Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'
import { ClaimNextRagJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/claim-next-rag-job.use-case.js'
import {
  RAG_DOCUMENT_INDEX_STATUS,
  type RagDocumentIndexStatus,
} from '../../../src/Domain/Knowledge/Enums/rag-document-index-status.enum.js'

const candidate = (input: {
  id: string
  generation: string
  indexStatus: RagDocumentIndexStatus
  requestedGeneration: string
  documentId?: string
}): RagJobClaimCandidate => ({
  job: {
    id: input.id,
    knowledgeBaseId: 'knowledge-base',
    documentId: input.documentId ?? 'document',
    documentIndexId: `index-${input.id}`,
    generation: input.generation,
    attempts: 2,
  },
  indexStatus: input.indexStatus,
  membership: { requestedGeneration: input.requestedGeneration, activeDocumentIndexId: null },
  runningSiblingLeases: [],
})

test('applies lease recovery, stale generation, activation, and claim decisions in Application', async () => {
  const candidates = [
    candidate({
      id: 'stale',
      generation: '1',
      indexStatus: RAG_DOCUMENT_INDEX_STATUS.BUILDING,
      requestedGeneration: '2',
      documentId: 'doc-a',
    }),
    candidate({
      id: 'ready',
      generation: '2',
      indexStatus: RAG_DOCUMENT_INDEX_STATUS.READY,
      requestedGeneration: '2',
      documentId: 'doc-b',
    }),
    candidate({
      id: 'claim',
      generation: '2',
      indexStatus: RAG_DOCUMENT_INDEX_STATUS.BUILDING,
      requestedGeneration: '2',
      documentId: 'doc-c',
    }),
  ]
  const discarded: string[] = []
  const activations: unknown[] = []
  const recoveryJobs: ReadonlyArray<ExpiredRagJob> = [
    {
      id: 'expired-terminal',
      knowledgeBaseId: 'knowledge-base',
      documentId: 'document',
      documentIndexId: 'expired-index',
      generation: '1',
      attempts: 4,
      payload: { source: 'test' },
      executionState: null,
      leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
    },
  ]
  const recoveryEvents: string[] = []
  const recoveryTransactionIds: number[] = []
  const claims: Array<{ jobId: string; claim: RagJobClaim }> = []
  let transactionSequence = 0
  let activeTransaction = 0
  const candidateTransactionIds: number[] = []
  const transaction: RagJobClaimTransaction = {
    lockExpiredJobs: async () => recoveryJobs,
    retryExpiredJob: async () => {
      recoveryEvents.push('retry')
    },
    archiveExpiredJob: async () => {
      recoveryEvents.push('archive')
      recoveryTransactionIds.push(activeTransaction)
    },
    removeExpiredJob: async () => {
      recoveryEvents.push('remove')
      recoveryTransactionIds.push(activeTransaction)
    },
    countQueuedCandidates: async () => candidates.length,
    findNextCandidate: async () => {
      candidateTransactionIds.push(activeTransaction)
      const next = candidates.shift()

      return next ? { kind: RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS.candidate, candidate: next } : null
    },
    discardQueuedJob: async (jobId) => {
      discarded.push(jobId)

      return true
    },
    setMembershipActiveIndex: async (activation) => {
      activations.push(activation)

      return true
    },
    markIndexReferenced: async () => {},
    markIndexUnreferenced: async (indexId) => {
      if (indexId === 'expired-index') {
        recoveryEvents.push('unreference')
        recoveryTransactionIds.push(activeTransaction)
      }
    },
    claimQueuedJob: async (jobId, _claimedAt, claim) => {
      claims.push({ jobId, claim })

      return {
        id: jobId,
        knowledgeBaseId: 'knowledge-base',
        documentId: 'document',
        documentIndexId: `index-${jobId}`,
        generation: '2',
        attempts: claim.attempts,
        leaseToken: claim.leaseToken,
        leaseExpiresAt: claim.leaseExpiresAt,
        executionVerification: claim.executionVerification,
      }
    },
  }
  const boundary = {
    withClaimTransaction: async <T>(work: (value: RagJobClaimTransaction) => Promise<T>) => {
      activeTransaction = ++transactionSequence
      try {
        return await work(transaction)
      } finally {
        activeTransaction = 0
      }
    },
  } as RagJobClaimTransactionBoundary
  const cryptography = {
    generateLeaseToken: () => 'lease-token',
  } as RagCryptographyProvider

  const result = await new ClaimNextRagJobUseCase(boundary, cryptography, 30).execute()

  assert.deepEqual(discarded, ['stale', 'ready'])
  assert.deepEqual(activations, [
    {
      knowledgeBaseId: 'knowledge-base',
      documentId: 'doc-b',
      requestedGeneration: '2',
      expectedActiveDocumentIndexId: null,
      documentIndexId: 'index-ready',
    },
  ])
  assert.deepEqual(recoveryEvents, ['archive', 'unreference', 'remove'])
  assert.equal(new Set(recoveryTransactionIds).size, 1)
  assert.equal(result?.id, 'claim')
  assert.equal(result?.attempts, 3)
  assert.equal(result?.leaseToken, 'lease-token')
  assert.equal(claims[0]?.jobId, 'claim')
  assert.equal(claims[0]?.claim.executionVerification.claimToken, 'lease-token')
  assert.equal(candidateTransactionIds.length, 3)
  assert.equal(new Set(candidateTransactionIds).size, 3)
})

test('bounds skipped candidate scans without issuing a token or incrementing attempts', async () => {
  const excludedIndexes: string[][] = []
  let claims = 0
  let tokens = 0
  const transaction: RagJobClaimTransaction = {
    lockExpiredJobs: async () => [],
    retryExpiredJob: async () => assert.fail('no expired retry expected'),
    archiveExpiredJob: async () => assert.fail('no expired archive expected'),
    removeExpiredJob: async () => assert.fail('no expired deletion expected'),
    countQueuedCandidates: async () => 2,
    findNextCandidate: async (_availableAt, exclusions) => {
      excludedIndexes.push([...exclusions])

      return { kind: RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS.skip, documentIndexId: `locked-${excludedIndexes.length}` }
    },
    discardQueuedJob: async () => assert.fail('locked jobs must remain queued'),
    setMembershipActiveIndex: async () => assert.fail('locked index must not activate'),
    markIndexReferenced: async () => assert.fail('locked index must not mutate'),
    markIndexUnreferenced: async () => assert.fail('locked index must not mutate'),
    claimQueuedJob: async () => {
      claims += 1

      return assert.fail('locked jobs must not claim')
    },
  }
  const boundary = {
    withClaimTransaction: async <T>(work: (value: RagJobClaimTransaction) => Promise<T>) => work(transaction),
  } as RagJobClaimTransactionBoundary
  const cryptography = {
    generateLeaseToken: () => {
      tokens += 1

      return 'unexpected-token'
    },
  } as RagCryptographyProvider

  const result = await new ClaimNextRagJobUseCase(boundary, cryptography, 30).execute()

  assert.equal(result, null)
  assert.deepEqual(excludedIndexes, [[], ['locked-1']])
  assert.equal(claims, 0)
  assert.equal(tokens, 0)
})
