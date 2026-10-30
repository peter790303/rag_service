export class InvalidDocumentRevisionContentException extends Error {
  constructor(message = 'Document revision content must be text and its title must be text or null.') {
    super(message)
    this.name = 'InvalidDocumentRevisionContentException'
  }
}
