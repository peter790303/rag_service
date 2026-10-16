export class IndexRequestDocumentUnavailableException extends Error {
  readonly code = 'INDEX_REQUEST_DOCUMENT_UNAVAILABLE'

  constructor() {
    super('Document is no longer available')
    this.name = 'IndexRequestDocumentUnavailableException'
  }
}
