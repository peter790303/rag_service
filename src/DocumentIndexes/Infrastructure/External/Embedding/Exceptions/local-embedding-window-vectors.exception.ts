export class LocalEmbeddingWindowVectorsException extends Error {
  readonly code = 'LOCAL_EMBEDDING_WINDOW_VECTORS_INVALID'

  constructor() {
    super('Local embedding window vectors are invalid')
    this.name = 'LocalEmbeddingWindowVectorsException'
  }
}
