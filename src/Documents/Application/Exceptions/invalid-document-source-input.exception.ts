export class InvalidDocumentSourceInputException extends Error {
  readonly code = 'INVALID_DOCUMENT_SOURCE_INPUT'

  constructor(readonly field: string) {
    super(`Document source input must provide a valid ${field}.`)
    this.name = 'InvalidDocumentSourceInputException'
  }
}
