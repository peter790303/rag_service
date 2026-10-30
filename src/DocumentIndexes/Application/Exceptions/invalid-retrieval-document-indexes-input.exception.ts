export class InvalidRetrievalDocumentIndexesInputException extends Error {
  readonly code = 'INVALID_RETRIEVAL_DOCUMENT_INDEXES_INPUT'

  constructor(readonly field: string) {
    super(`Retrieval document indexes input must provide a valid ${field}.`)
    this.name = 'InvalidRetrievalDocumentIndexesInputException'
  }
}
