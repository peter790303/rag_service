export type ActivateKnowledgeBaseDocumentIndexCommand = {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly generation: string
  readonly expectedActiveDocumentIndexId: string | null
  readonly documentIndexId: string
}
