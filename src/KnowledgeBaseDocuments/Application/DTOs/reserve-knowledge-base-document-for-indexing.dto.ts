export interface ReserveKnowledgeBaseDocumentForIndexingDTO {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly skipLocked?: boolean
  readonly generation?: string
}
