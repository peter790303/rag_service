import type { DocumentIndexingDeliveryDTO } from '../DataTransferObjects/document-indexing-delivery.dto.ts'

/** The claimed document index finished producing and persisting its chunks. */
export class DocumentIndexedEvent {
  readonly jobDelivery: DocumentIndexingDeliveryDTO

  readonly completedAt: Date

  constructor({
    jobDelivery,
    completedAt,
  }: {
    readonly jobDelivery: DocumentIndexingDeliveryDTO
    readonly completedAt: Date
  }) {
    this.jobDelivery = {
      ...jobDelivery,
      leaseExpiresAt: new Date(jobDelivery.leaseExpiresAt),
    }
    this.completedAt = new Date(completedAt)
  }
}
