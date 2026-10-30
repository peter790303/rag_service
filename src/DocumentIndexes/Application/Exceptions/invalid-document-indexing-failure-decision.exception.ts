export class InvalidDocumentIndexingFailureDecisionException extends Error {
  readonly code = 'INVALID_DOCUMENT_INDEXING_FAILURE_DECISION'

  constructor(readonly context: { field: 'errorCode' | 'errorMessage' | 'failedAt' | 'retryAt' }) {
    super(`Document indexing failure decision requires a valid ${context.field}`)
    this.name = 'InvalidDocumentIndexingFailureDecisionException'
  }
}
