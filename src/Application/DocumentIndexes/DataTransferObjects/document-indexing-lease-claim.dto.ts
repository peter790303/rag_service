import type { DocumentIndexExecutionVerificationDto } from './document-index-execution-verification.dto.ts'

export type DocumentIndexingLeaseClaimDto = {
  attempts: number
  leaseToken: string
  leaseExpiresAt: Date
  executionVerification: DocumentIndexExecutionVerificationDto
}
