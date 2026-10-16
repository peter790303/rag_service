export class InvalidDocumentIndexingPayloadException extends Error {
  readonly code = 'INVALID_DOCUMENT_INDEXING_PAYLOAD'

  constructor() {
    super('Document indexing payload must be an object when provided')
    this.name = 'InvalidDocumentIndexingPayloadException'
  }
}
