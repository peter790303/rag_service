export class DocumentIndexExecutionClaimLimitReachedException extends Error {
  readonly code = 'INDEX_JOB_CLAIM_LIMIT_REACHED'

  constructor(readonly context: { attempts: number }) {
    super('RAG jobs may be claimed at most four times')
    this.name = 'DocumentIndexExecutionClaimLimitReachedException'
  }
}
