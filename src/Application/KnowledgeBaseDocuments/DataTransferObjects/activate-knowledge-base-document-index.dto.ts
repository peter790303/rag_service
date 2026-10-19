export interface ActivateKnowledgeBaseDocumentIndexDTO {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly generation: string
  readonly expectedActiveDocumentIndexId: string | null
  readonly documentIndexId: string
}
