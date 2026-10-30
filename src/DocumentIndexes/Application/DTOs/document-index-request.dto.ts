import type { DocumentIndexStatus } from '../../Domain/Enums/document-index-status.enum.ts'
import type { DocumentIndexExecutionStatus } from '../Helpers/document-index-execution-lifecycle.helper.ts'

export type PreparedDocumentIndexRequest = {
  documentId: string
  revisionId: string
  documentIndexId: string
  currentGeneration: string
  activeDocumentIndexId: string | null
  currentGenerationJobDocumentIndexId: string | null
  currentJobId: string | null
  indexStatus: DocumentIndexStatus
  currentJobStatus: DocumentIndexExecutionStatus | null
  hasCurrentUnretriedFailure: boolean
}

export type DocumentIndexRequestResult = {
  documentId: string
  revisionId: string
  documentIndexId: string
  jobId: string | null
  generation: string
  reusedReadyIndex: boolean
  blockedByFailedJob: boolean
}
