import type {
  RagJobStatusDto,
  RagSourceDocumentDto,
  RetryFailedJobDto,
} from '../../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'

export type RetryContext = {
  failedJob: {
    id: string
    knowledgeBaseId: string
    documentId: string
    documentIndexId: string
    generation: number
    retryOfFailedJobId: string | null
    retriedAt: Date | null
    retryPayload: Record<string, unknown>
  }
  knowledgeBase: { id: string; projectId: string }
  document: { id: string; latestRevision: { id: string; contentSha256: string; content: string } | null }
  membership: { activeDocumentIndexId: string | null; requestedGeneration: number } | null
  documentIndex: {
    id: string
    documentRevisionId: string
    pipelineHash: string
    status: string
    readyAt: Date | null
  } | null
  activeJob: { id: string; status: string; leaseExpiresAt: Date | null } | null
  currentSource: RagSourceDocumentDto | null
}

export type RetryFailedJobAtomicallyInput = {
  projectId: string
  failedJobId: string
  expectedKnowledgeBaseId: string
  expectedDocumentId: string
  expectedDocumentIndexId: string
  expectedGeneration: number
  expectedRevisionId: string
  expectedPipelineHash: string
  now: Date
  idempotencyKey: string
}

export type RetryFailedJobAtomicallyResult =
  | { status: 'retried'; jobId: string }
  | { status: 'not-found' | 'already-retried' | 'active-job-exists' | 'not-current' | 'stale' }

export abstract class RagJobStatusReader {
  abstract jobStatus(projectId: string, jobId: string): Promise<RagJobStatusDto>
}

export abstract class RagFailedJobRetryStore {
  abstract readRetryContext(projectId: string, failedJobId: string): Promise<RetryContext | null>

  abstract retryFailedJobAtomically(input: RetryFailedJobAtomicallyInput): Promise<RetryFailedJobAtomicallyResult>
}

export type RagRetryUseCaseResult = RetryFailedJobDto
