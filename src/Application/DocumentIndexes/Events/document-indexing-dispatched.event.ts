import type { DocumentIndexingDeliveryDto } from '../DataTransferObjects/document-indexing-delivery.dto.ts'

/** Document indexing was dispatched under the committed execution lease. */
export class DocumentIndexingDispatchedEvent {
  readonly jobId: string

  readonly knowledgeBaseId: string

  readonly documentId: string

  readonly documentIndexId: string

  readonly generation: string

  readonly attempts: number

  readonly leaseToken: string

  readonly leaseExpiresAt: Date

  constructor(claim: DocumentIndexingDeliveryDto) {
    this.jobId = claim.id
    this.knowledgeBaseId = claim.knowledgeBaseId
    this.documentId = claim.documentId
    this.documentIndexId = claim.documentIndexId
    this.generation = claim.generation
    this.attempts = claim.attempts
    this.leaseToken = claim.leaseToken
    this.leaseExpiresAt = new Date(claim.leaseExpiresAt)
  }
}
