export class InvalidJobPersistenceStateException extends Error {
  readonly code = 'INVALID_INDEX_JOB_PERSISTENCE_STATE'

  constructor(readonly context: { status: string }) {
    super(`Expected a running RAG job, received ${context.status}`)
    this.name = 'InvalidJobPersistenceStateException'
  }
}
