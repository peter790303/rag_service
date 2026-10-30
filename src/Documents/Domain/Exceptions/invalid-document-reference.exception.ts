export class InvalidDocumentReferenceException extends Error {
  readonly code = 'INVALID_DOCUMENT_REFERENCE'

  constructor() {
    super('A document reference requires a non-empty path')
    this.name = 'InvalidDocumentReferenceException'
  }
}
