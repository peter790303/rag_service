import type { DocumentIndexExecutionVerificationDto } from './document-index-execution-verification.dto.ts'
import type { DocumentIndexStatus } from '../../../Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import type { DocumentIndexExecutionStatus } from '../Helpers/document-index-execution-lifecycle.helper.ts'

export type DocumentIndexingStatusFacts = {
  activeIndex: { id: string; status: DocumentIndexStatus; readyAt: Date | null } | null
  requestedTarget: {
    indexId: string
    generation: string
    targetStateFacts: {
      requestedGeneration: string | null | undefined
      targetGeneration: string
      activeJobStatus: DocumentIndexExecutionStatus | null
      hasFailedJob: boolean
      targetIndexStatus: DocumentIndexStatus | null
    }
    jobId: string | null
    failedJobId: string | null
    attempts: number | null
    errorCode: string | null
    errorMessage: string | null
    executionVerification: DocumentIndexExecutionVerificationDto | null
  } | null
}
