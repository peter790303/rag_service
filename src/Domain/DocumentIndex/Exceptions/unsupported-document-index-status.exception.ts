export class UnsupportedDocumentIndexStatusException extends Error {
  readonly code = 'UNSUPPORTED_DOCUMENT_INDEX_STATUS'

  constructor(readonly context: { status: string }) {
    super(`Unsupported RAG document index status: ${context.status}`)
    this.name = 'UnsupportedDocumentIndexStatusException'
  }
}
