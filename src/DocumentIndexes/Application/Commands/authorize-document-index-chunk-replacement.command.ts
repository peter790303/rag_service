export type AuthorizeDocumentIndexChunkReplacementCommand = {
  readonly delivery: {
    readonly id: string
    readonly knowledgeBaseId: string
    readonly documentId: string
    readonly documentIndexId: string
    readonly generation: string
    readonly attempts: number
    readonly leaseToken: string
    readonly leaseExpiresAt: Date
  }
}
