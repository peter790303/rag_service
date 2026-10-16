export class InvalidDocumentIndexTimestampException extends Error {
  readonly code = 'INVALID_DOCUMENT_INDEX_TIMESTAMP'

  constructor(readonly context: { field: 'createdAt' | 'readyAt' | 'unreferencedSince' }) {
    super('Document index lifecycle timestamps must be valid dates')
    this.name = 'InvalidDocumentIndexTimestampException'
  }
}
