import type { DocumentIndexExecutionVerificationDTO } from './document-index-execution-verification.dto.ts'
import type { DocumentIndexExecutionStatus } from '../Helpers/document-index-execution-lifecycle.helper.ts'

export type DocumentIndexingStatusSourceDTO = {
  knowledgeBaseId: string
  documentId: string
  indexId: string
  generation: string
  activeJobStatus: DocumentIndexExecutionStatus | null
  hasSuccessfulReceipt: boolean
  jobId: string | null
  failedJobId: string | null
  attempts: number | null
  errorCode: string | null
  errorMessage: string | null
  executionVerification: DocumentIndexExecutionVerificationDTO | null
}
