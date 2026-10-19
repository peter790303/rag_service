export type RetrievalDocumentIndexDTO = {
  id: string
  documentId: string
  revisionId: string
  chunkingModel: string
  chunkingProfile: string
  embeddingModel: string
  embeddingDimensions: number
  embeddingProfile: string
  lexicalProfile: string
  relationProfile: string
  readyAt: Date | null
}
