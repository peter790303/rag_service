import type { DocumentIndexStatus } from '../../Domain/Enums/document-index-status.enum.ts'
import type { DocumentIndexExecutionStatus } from '../Helpers/document-index-execution-lifecycle.helper.ts'

export type DocumentIndexingRetryContext = {
  failedJob: {
    id: string
    knowledgeBaseId: string
    documentId: string
    documentIndexId: string
    generation: string
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
  knowledgeBaseDocument: { activeDocumentIndexId: string | null; requestedGeneration: string } | null
  documentIndex: {
    id: string
    documentRevisionId: string
    pipelineHash: string
    status: DocumentIndexStatus
    readyAt: Date | null
  } | null
  activeJob: { id: string; status: DocumentIndexExecutionStatus } | null
}
