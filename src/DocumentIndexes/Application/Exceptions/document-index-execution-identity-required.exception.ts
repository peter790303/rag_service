export class DocumentIndexExecutionIdentityRequiredException extends Error {
  readonly code = 'INDEX_JOB_IDENTITY_REQUIRED'

  constructor() {
    super('RAG job id must be non-empty')
    this.name = 'DocumentIndexExecutionIdentityRequiredException'
  }
}
