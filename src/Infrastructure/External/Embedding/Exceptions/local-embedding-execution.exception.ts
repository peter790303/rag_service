export class LocalEmbeddingExecutionException extends Error {
  readonly code = 'LOCAL_EMBEDDING_EXECUTION_FAILED'

  constructor(options?: ErrorOptions) {
    super('Local embedding worker execution failed', options)
    this.name = 'LocalEmbeddingExecutionException'
  }
}
