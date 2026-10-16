export class IncompleteDocumentIndexContextException extends Error {
  readonly code = 'INCOMPLETE_DOCUMENT_INDEX_CONTEXT'

  constructor() {
    super('Retry mapping requires a document revision and membership')
    this.name = 'IncompleteDocumentIndexContextException'
  }
}
