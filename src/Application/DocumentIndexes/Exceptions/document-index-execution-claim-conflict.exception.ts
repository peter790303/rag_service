export class DocumentIndexExecutionClaimConflictException extends Error {
  readonly code = 'INDEX_JOB_CLAIM_CONFLICT'

  constructor(readonly context: { jobId: string; transition: 'expiredRetry' | 'readyActivation' | 'leaseClaim' }) {
    const messages = {
      expiredRetry: `Expired RAG job ${context.jobId} changed while its retry was queued`,
      readyActivation: `Ready RAG job ${context.jobId} changed while its index was activated`,
      leaseClaim: `RAG job ${context.jobId} changed while its lease was claimed`,
    }
    super(messages[context.transition])
    this.name = 'DocumentIndexExecutionClaimConflictException'
  }
}
