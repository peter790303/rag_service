export class InvalidRetrievalDocumentRevisionsInputException extends Error {
  readonly code = 'INVALID_RETRIEVAL_DOCUMENT_REVISIONS_INPUT'

  constructor(readonly field: string) {
    super(`Retrieval document revisions input must provide a valid ${field}.`)
    this.name = 'InvalidRetrievalDocumentRevisionsInputException'
  }
}
