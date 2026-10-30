export type CompleteKnowledgeBaseDocumentIndexingCommand = {
  readonly knowledgeBaseDocument: {
    readonly knowledgeBaseId: string
    readonly documentId: string
    readonly requestedGeneration: string
    readonly activeDocumentIndexId: string | null
    readonly isEntry: boolean
    readonly alwaysIncludeFullContent: boolean
    readonly updatedAt: Date
  }
  readonly generation: string
  readonly documentIndexId: string
}
