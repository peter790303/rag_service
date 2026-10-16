export class InvalidDocumentIdentityException extends Error {
  constructor(message = 'Document identity must be non-empty.') {
    super(message)
    this.name = 'InvalidDocumentIdentityException'
  }
}
