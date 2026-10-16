export class InvalidDocumentTimestampException extends Error {
  constructor(message = 'Document timestamps must be valid dates.') {
    super(message)
    this.name = 'InvalidDocumentTimestampException'
  }
}
