export class InvalidDocumentRevisionHashException extends Error {
  constructor(message = 'Document revision content hash must be a SHA-256 hexadecimal digest.') {
    super(message)
    this.name = 'InvalidDocumentRevisionHashException'
  }
}
