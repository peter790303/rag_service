export class InvalidDocumentIndexExecutionTimestampException extends Error {
  readonly code = 'INVALID_INDEX_JOB_TIMESTAMP'

  constructor(readonly context: { field: 'leaseExpiresAt' | 'now' | 'failedAt' | 'retryAt' }) {
    super('Index job lifecycle timestamps must be valid dates')
    this.name = 'InvalidDocumentIndexExecutionTimestampException'
  }
}
