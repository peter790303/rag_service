import type { DocumentIndexingDeliveryDto } from '../DataTransferObjects/document-indexing-delivery.dto.ts'

/** Chunk replacement preparation has been requested for a claimed execution. */
export class DocumentIndexChunkReplacementRequestedEvent {
  readonly delivery: DocumentIndexingDeliveryDto

  constructor(delivery: DocumentIndexingDeliveryDto) {
    this.delivery = { ...delivery, leaseExpiresAt: new Date(delivery.leaseExpiresAt) }
  }
}
