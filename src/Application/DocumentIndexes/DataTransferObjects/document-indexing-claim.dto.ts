import type { DocumentIndexExecutionVerificationDto } from './document-index-execution-verification.dto.ts'

export type DocumentIndexingClaimDto = {
  id: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  leaseToken: string
  leaseExpiresAt: Date
  executionVerification: DocumentIndexExecutionVerificationDto
}
