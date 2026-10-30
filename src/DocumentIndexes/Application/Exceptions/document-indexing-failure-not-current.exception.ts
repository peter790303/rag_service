export class DocumentIndexingFailureNotCurrentException extends Error {
  readonly code = 'DOCUMENT_INDEXING_FAILURE_NOT_CURRENT'

  constructor() {
    super('Failed job is no longer retryable: not-current')
    this.name = 'DocumentIndexingFailureNotCurrentException'
  }
}
