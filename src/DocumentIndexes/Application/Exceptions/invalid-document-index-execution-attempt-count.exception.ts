export class InvalidDocumentIndexExecutionAttemptCountException extends Error {
  readonly code = 'INVALID_INDEX_JOB_ATTEMPT_COUNT'

  constructor(readonly context: { attempts: number }) {
    super('RAG job attempts must be a non-negative safe integer')
    this.name = 'InvalidDocumentIndexExecutionAttemptCountException'
  }
}
