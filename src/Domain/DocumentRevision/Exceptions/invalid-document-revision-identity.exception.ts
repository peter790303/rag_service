export class InvalidDocumentRevisionIdentityException extends Error {
  constructor(message = 'Document revision and parent document identities must be non-empty.') {
    super(message)
    this.name = 'InvalidDocumentRevisionIdentityException'
  }
}
