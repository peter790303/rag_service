export class InvalidRagJobLeaseException extends Error {
  readonly code = 'INVALID_RAG_JOB_LEASE'

  constructor() {
    super('Indexing job lease is no longer owned by this worker')
    this.name = 'InvalidRagJobLeaseException'
  }
}
