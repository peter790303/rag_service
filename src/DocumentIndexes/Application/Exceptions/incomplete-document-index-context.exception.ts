export class IncompleteDocumentIndexContextException extends Error {
  readonly code = 'INCOMPLETE_DOCUMENT_INDEX_CONTEXT'

  constructor() {
    super('Retry mapping requires a document revision and knowledgeBaseDocument')
    this.name = 'IncompleteDocumentIndexContextException'
  }
}
