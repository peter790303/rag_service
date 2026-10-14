import type { RagDocumentIndexStatus } from '../../../Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import type { RagExecutionStageEnum } from '../../../Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { RAG_JOB_STATUS, type RagJobStatus } from '../../../Domain/Knowledge/rag-job.js'

export const RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS = {
  RETRIED: 'RETRIED',
  NOT_FOUND: 'NOT_FOUND',
  STALE: 'STALE',
} as const

export type RagJobFailureDecision = {
  errorCode: string
  errorMessage: string
  failedAt: Date
  retryAt: Date | null
}

export type RetryContext = {
  failedJob: {
    id: string
    knowledgeBaseId: string
    documentId: string
    documentIndexId: string
    generation: number
    attempts: number
    retryOfFailedJobId: string | null
    retriedAt: Date | null
    retryPayload: { input: Record<string, unknown>; executionState: Record<string, unknown> | null }
  }
  knowledgeBase: { id: string; projectId: string }
  document: {
    id: string
    sourceType: string
    sourceKey: string
    sourcePath: string
    currentTitle: string | null
    targetRevision: { id: string; contentSha256: string; content: string } | null
  } | null
  membership: { activeDocumentIndexId: string | null; requestedGeneration: number } | null
  documentIndex: {
    id: string
    documentRevisionId: string
    pipelineHash: string
    status: RagDocumentIndexStatus
    readyAt: Date | null
  } | null
  activeJob: { id: string; status: RagJobStatus } | null
}

export type RetryFailedJobAtomicallyInput = {
  projectId: string
  failedJobId: string
  expected: {
    knowledgeBaseId: string
    documentId: string
    documentIndexId: string
    generation: number
    attempts: number
    retriedAt: null
    sourceType: string
    revisionId: string
    pipelineHash: string
    membership: { requestedGeneration: number; activeDocumentIndexId: string | null }
    activeJobId: null
  }
  retry: {
    status: typeof RAG_JOB_STATUS.QUEUED
    attempts: 0
    payload: Record<string, unknown>
    executionState: Record<string, unknown> | null
  }
  now: Date
  idempotencyKey: string
}

export type RetryFailedJobAtomicallyResult =
  | { status: typeof RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.RETRIED; jobId: string }
  | { status: typeof RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.NOT_FOUND }
  | { status: typeof RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.STALE }

export type RagJobExecutionVerification = {
  stage: RagExecutionStageEnum
  completedUnits: number
  totalUnits: number | null
  verifiedAt: string | null
  claimToken?: string | null
  leaseExpiresAt?: string | null
}

export type RagJobStatusFacts = {
  activeIndex: { id: string; status: RagDocumentIndexStatus; readyAt: Date | null } | null
  requestedTarget: {
    indexId: string
    generation: string
    targetStateFacts: {
      requestedGeneration: string | null | undefined
      targetGeneration: string
      activeJobStatus: RagJobStatus | null
      hasFailedJob: boolean
      targetIndexStatus: RagDocumentIndexStatus | null
    }
    jobId: string | null
    failedJobId: string | null
    attempts: number | null
    errorCode: string | null
    errorMessage: string | null
    executionVerification: RagJobExecutionVerification | null
  } | null
}

export abstract class RagJobStatusReader {
  abstract jobStatus(projectId: string, jobId: string): Promise<RagJobStatusFacts>
}

export abstract class RagFailedJobRetryStore {
  abstract readRetryContext(failedJobId: string): Promise<RetryContext | null>

  abstract retryFailedJobAtomically(input: RetryFailedJobAtomicallyInput): Promise<RetryFailedJobAtomicallyResult>
}
