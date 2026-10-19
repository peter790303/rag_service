export class LocalEmbeddingVectorMagnitudeException extends Error {
  readonly code = 'LOCAL_EMBEDDING_VECTOR_MAGNITUDE_INVALID'

  constructor() {
    super('Local embedding pooled vector magnitude is invalid')
    this.name = 'LocalEmbeddingVectorMagnitudeException'
  }
}
