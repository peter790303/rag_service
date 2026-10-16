export class InvalidDocumentRelationStateException extends Error {
  readonly code = 'INVALID_DOCUMENT_RELATION_STATE'

  constructor(readonly field: string) {
    super(`Document relation has an invalid ${field}`)
    this.name = 'InvalidDocumentRelationStateException'
  }
}
