/** Committed claim identifiers and fencing metadata required to process one durable job. */
export type DocumentIndexingDeliveryDTO = {
  readonly id: string
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly documentIndexId: string
  readonly generation: string
  readonly attempts: number
  readonly leaseToken: string
  readonly leaseExpiresAt: Date
}
