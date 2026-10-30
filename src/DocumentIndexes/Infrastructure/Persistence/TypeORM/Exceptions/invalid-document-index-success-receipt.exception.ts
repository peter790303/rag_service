export class InvalidDocumentIndexSuccessReceiptException extends Error {
  readonly code = 'INVALID_DOCUMENT_INDEX_SUCCESS_RECEIPT'

  constructor() {
    super('Success receipt must contain either known completion facts or explicit historical recovery provenance')
    this.name = 'InvalidDocumentIndexSuccessReceiptException'
  }
}
