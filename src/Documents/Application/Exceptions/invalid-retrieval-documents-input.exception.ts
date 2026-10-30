export class InvalidRetrievalDocumentsInputException extends Error {
  readonly code = 'INVALID_RETRIEVAL_DOCUMENTS_INPUT'

  constructor(readonly field: string) {
    super(`Retrieval documents input must provide a valid ${field}.`)
    this.name = 'InvalidRetrievalDocumentsInputException'
  }
}
