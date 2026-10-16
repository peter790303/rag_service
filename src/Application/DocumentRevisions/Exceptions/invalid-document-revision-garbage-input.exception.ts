export class InvalidDocumentRevisionGarbageInputException extends Error {
  readonly code = 'INVALID_DOCUMENT_REVISION_GARBAGE_INPUT'

  constructor(readonly field: string) {
    super(`Invalid document revision garbage input: ${field}`)
    this.name = 'InvalidDocumentRevisionGarbageInputException'
  }
}
