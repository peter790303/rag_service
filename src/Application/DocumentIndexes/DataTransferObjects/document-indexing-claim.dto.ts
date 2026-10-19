import type { DocumentIndexExecutionVerificationDTO } from './document-index-execution-verification.dto.ts'

export type DocumentIndexingClaimDTO = {
  id: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  leaseToken: string
  leaseExpiresAt: Date
  executionVerification: DocumentIndexExecutionVerificationDTO
}
