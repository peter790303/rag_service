export class InvalidDocumentIndexExecutionLeaseDurationException extends Error {
  readonly code = 'INVALID_INDEX_JOB_LEASE_DURATION'

  constructor(readonly context: { leaseSeconds: number }) {
    super('RAG job lease duration must be positive and finite')
    this.name = 'InvalidDocumentIndexExecutionLeaseDurationException'
  }
}
