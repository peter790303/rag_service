export class InvalidDocumentIndexStateException extends Error {
  readonly code = 'INVALID_DOCUMENT_INDEX_STATE'

  constructor(readonly context: { field: string }) {
    super('Document index state must contain valid identity and pipeline metadata')
    this.name = 'InvalidDocumentIndexStateException'
  }
}
