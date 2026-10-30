export class InvalidDocumentSourceException extends Error {
  constructor(message = 'Document source identity and title must be valid.') {
    super(message)
    this.name = 'InvalidDocumentSourceException'
  }
}
