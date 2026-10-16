export class DocumentIndexIdentityRequiredException extends Error {
  readonly code = 'DOCUMENT_INDEX_IDENTITY_REQUIRED'

  constructor() {
    super('RAG document index id must be non-empty')
    this.name = 'DocumentIndexIdentityRequiredException'
  }
}
