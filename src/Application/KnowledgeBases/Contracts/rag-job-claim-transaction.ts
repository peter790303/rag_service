import type { RagJobExecutionVerification } from './rag-job-management.js'
import type { RagDocumentIndexStatus } from '../../../Domain/Knowledge/Enums/rag-document-index-status.enum.js'

export const RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS = {
  candidate: 'candidate',
  skip: 'skip',
} as const

export type RagJobClaimCandidateResultKind =
  (typeof RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS)[keyof typeof RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS]

export const EXPIRED_RAG_JOB_TRANSITION_KINDS = {
  retry: 'retry',
  archive: 'archive',
} as const

export type ExpiredRagJobTransitionKind =
  (typeof EXPIRED_RAG_JOB_TRANSITION_KINDS)[keyof typeof EXPIRED_RAG_JOB_TRANSITION_KINDS]

export type ExpiredRagJob = {
  id: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  payload: Record<string, unknown>
  executionState: Record<string, unknown> | null
  leaseExpiresAt: Date | null
}

export type RagMembershipActivation = {
  knowledgeBaseId: string
  documentId: string
  requestedGeneration: string
  expectedActiveDocumentIndexId: string | null
  documentIndexId: string
}

export type RagJobClaimCandidate = {
  job: Pick<ExpiredRagJob, 'id' | 'knowledgeBaseId' | 'documentId' | 'documentIndexId' | 'generation' | 'attempts'>
  indexStatus: RagDocumentIndexStatus | null
  membership: { requestedGeneration: string; activeDocumentIndexId: string | null } | null
  runningSiblingLeases: ReadonlyArray<{
    id: string
    attempts: number
    leaseExpiresAt: Date | null
  }>
}

export type RagJobClaimCandidateResult =
  | { kind: typeof RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS.candidate; candidate: RagJobClaimCandidate }
  | { kind: typeof RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS.skip; documentIndexId: string }
  | null

export type ExpiredRagJobTransition =
  | {
      kind: typeof EXPIRED_RAG_JOB_TRANSITION_KINDS.retry
      jobId: string
      retryAt: Date
      executionState: Record<string, unknown>
    }
  | {
      kind: typeof EXPIRED_RAG_JOB_TRANSITION_KINDS.archive
      jobId: string
      archive: RagFailedJobArchive
      indexUnreferencedSince: Date
    }

export type RagFailedJobArchive = {
  jobId: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  errorCode: string
  errorMessage: string
  blockedReasons: unknown[]
  retryPayload: Record<string, unknown>
  failedAt: Date
  retriedAt: null
}

export type RagJobClaim = {
  attempts: number
  leaseToken: string
  leaseExpiresAt: Date
  executionVerification: RagJobExecutionVerification
}

export type ClaimedRagIndexJobContract = {
  id: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  leaseToken: string
  leaseExpiresAt: Date
  executionVerification: RagJobExecutionVerification
}

/** Narrow claim transaction capabilities; business decisions are supplied by the caller. */
export interface RagJobClaimTransaction {
  lockExpiredJobs(now: Date): Promise<ReadonlyArray<ExpiredRagJob>>

  retryExpiredJob(jobId: string, retryAt: Date, executionState: Record<string, unknown>): Promise<void>

  archiveExpiredJob(archive: RagFailedJobArchive): Promise<void>

  removeExpiredJob(jobId: string): Promise<void>

  countQueuedCandidates(availableAt: Date): Promise<number>

  findNextCandidate(
    availableAt: Date,
    excludedDocumentIndexIds: ReadonlyArray<string>,
  ): Promise<RagJobClaimCandidateResult>

  discardQueuedJob(jobId: string): Promise<boolean>

  setMembershipActiveIndex(activation: RagMembershipActivation): Promise<boolean>

  markIndexReferenced(documentIndexId: string): Promise<void>

  markIndexUnreferenced(documentIndexId: string, unreferencedSince: Date): Promise<void>

  claimQueuedJob(jobId: string, claimedAt: Date, claim: RagJobClaim): Promise<ClaimedRagIndexJobContract>
}

/** Transaction boundary for atomic lease recovery and queue claims. */
export abstract class RagJobClaimTransactionBoundary {
  abstract withClaimTransaction<T>(work: (transaction: RagJobClaimTransaction) => Promise<T>): Promise<T>
}
