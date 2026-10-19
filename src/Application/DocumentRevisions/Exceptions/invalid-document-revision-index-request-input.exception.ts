export class InvalidDocumentRevisionIndexRequestInputException extends Error {
  readonly code = 'INVALID_DOCUMENT_REVISION_INDEX_REQUEST_INPUT'

  constructor(readonly field: string) {
    super(`Document revision index request must provide a valid ${field}.`)
    this.name = 'InvalidDocumentRevisionIndexRequestInputException'
  }
}
