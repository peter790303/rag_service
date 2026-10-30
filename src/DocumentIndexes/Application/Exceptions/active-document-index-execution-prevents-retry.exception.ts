export class ActiveDocumentIndexExecutionPreventsRetryException extends Error {
  readonly code = 'ACTIVE_DOCUMENT_INDEX_EXECUTION_PREVENTS_RETRY'

  constructor() {
    super('Failed job is no longer retryable: active-job-exists')
    this.name = 'ActiveDocumentIndexExecutionPreventsRetryException'
  }
}
