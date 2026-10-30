export type PrepareKnowledgeBaseDocumentForIndexRequestCommand = {
  readonly sourceDocument: {
    readonly knowledgeBaseId: string
    readonly isEntry?: boolean
    readonly alwaysIncludeFullContent?: boolean
  }
  readonly documentId: string
}
