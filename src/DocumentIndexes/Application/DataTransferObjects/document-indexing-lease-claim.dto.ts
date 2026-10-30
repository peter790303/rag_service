import type { DocumentIndexExecutionVerificationDTO } from './document-index-execution-verification.dto.ts'

export type DocumentIndexingLeaseClaimDTO = {
  attempts: number
  leaseToken: string
  leaseExpiresAt: Date
  executionVerification: DocumentIndexExecutionVerificationDTO
}
