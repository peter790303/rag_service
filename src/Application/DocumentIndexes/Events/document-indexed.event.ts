import type { DocumentIndexingDeliveryDto } from '../DataTransferObjects/document-indexing-delivery.dto.ts'

/** The claimed document index finished producing and persisting its chunks. */
export class DocumentIndexedEvent {
  readonly jobDelivery: DocumentIndexingDeliveryDto

  readonly completedAt: Date

  constructor({
    jobDelivery,
    completedAt,
  }: {
    readonly jobDelivery: DocumentIndexingDeliveryDto
    readonly completedAt: Date
  }) {
    this.jobDelivery = {
      ...jobDelivery,
      leaseExpiresAt: new Date(jobDelivery.leaseExpiresAt),
    }
    this.completedAt = new Date(completedAt)
  }
}
