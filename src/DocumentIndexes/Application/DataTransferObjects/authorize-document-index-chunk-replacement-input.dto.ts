import type { DocumentIndexingDeliveryDTO } from './document-indexing-delivery.dto.ts'

/** The committed job delivery whose claim authorizes replacing a document index. */
export class AuthorizeDocumentIndexChunkReplacementInputDTO {
  readonly delivery: DocumentIndexingDeliveryDTO

  constructor(delivery: DocumentIndexingDeliveryDTO) {
    this.delivery = { ...delivery, leaseExpiresAt: new Date(delivery.leaseExpiresAt) }
  }
}
