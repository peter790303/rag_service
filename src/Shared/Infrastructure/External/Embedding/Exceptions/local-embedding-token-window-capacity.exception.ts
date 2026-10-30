export class LocalEmbeddingTokenWindowCapacityException extends Error {
  readonly code = 'LOCAL_EMBEDDING_TOKEN_WINDOW_CAPACITY_INVALID'

  constructor() {
    super('Local embedding token window capacity is invalid')
    this.name = 'LocalEmbeddingTokenWindowCapacityException'
  }
}
