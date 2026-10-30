export class InvalidDocumentRelationInputException extends Error {
  readonly code = 'INVALID_DOCUMENT_RELATION_INPUT'

  constructor(readonly field: string) {
    super(`Document relation operation requires a valid ${field}`)
    this.name = 'InvalidDocumentRelationInputException'
  }
}
