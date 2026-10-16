import { DocumentIndexingTargetStateEnum } from '../Enums/document-indexing-target-state.enum.ts'

export type RetryDocumentIndexingResultDto = {
  jobId: string | null
  failedJobId: string
  status: DocumentIndexingTargetStateEnum
  retryOfFailedJobId: string
}
