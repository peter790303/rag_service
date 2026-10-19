import type { DocumentIndexExecutionVerificationDTO } from './document-index-execution-verification.dto.ts'
import type { DocumentIndexStatus } from '../../../Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { DocumentIndexingTargetStateEnum } from '../Enums/document-indexing-target-state.enum.ts'

export type DocumentIndexingStatusDTO = {
  activeIndex: {
    id: string
    status: DocumentIndexStatus
    readyAt: Date | null
  } | null
  requestedTarget: {
    indexId: string
    generation: string
    state: DocumentIndexingTargetStateEnum
    jobId: string | null
    failedJobId: string | null
    attempts: number | null
    errorCode: string | null
    errorMessage: string | null
    executionVerification: DocumentIndexExecutionVerificationDTO | null
  } | null
}
