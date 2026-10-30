export class InvalidDocumentRevisionTimestampException extends Error {
  constructor(message = 'Document revision timestamps must be valid dates.') {
    super(message)
    this.name = 'InvalidDocumentRevisionTimestampException'
  }
}
