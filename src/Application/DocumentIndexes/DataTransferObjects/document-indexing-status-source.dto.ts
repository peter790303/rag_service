import type { DocumentIndexExecutionVerificationDto } from './document-index-execution-verification.dto.ts'
import type { DocumentIndexExecutionStatus } from '../Helpers/document-index-execution-lifecycle.helper.ts'

export type DocumentIndexingStatusSourceDto = {
  knowledgeBaseId: string
  documentId: string
  indexId: string
  generation: string
  activeJobStatus: DocumentIndexExecutionStatus | null
  jobId: string | null
  failedJobId: string | null
  attempts: number
  errorCode: string | null
  errorMessage: string | null
  executionVerification: DocumentIndexExecutionVerificationDto | null
}
