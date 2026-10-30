import { DocumentIndexingTargetStateEnum } from '../Enums/document-indexing-target-state.enum.ts'

export type RetryDocumentIndexingResultDTO = {
  jobId: string | null
  failedJobId: string
  status: DocumentIndexingTargetStateEnum
  retryOfFailedJobId: string
}
