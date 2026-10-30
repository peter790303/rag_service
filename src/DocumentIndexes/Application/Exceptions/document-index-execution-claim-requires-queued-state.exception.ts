export class DocumentIndexExecutionClaimRequiresQueuedStateException extends Error {
  readonly code = 'INDEX_JOB_CLAIM_REQUIRES_QUEUED_STATE'

  constructor(readonly context: { status: string }) {
    super('Only queued RAG jobs may be claimed')
    this.name = 'DocumentIndexExecutionClaimRequiresQueuedStateException'
  }
}
