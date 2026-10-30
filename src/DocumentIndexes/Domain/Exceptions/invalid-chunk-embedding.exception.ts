export class InvalidChunkEmbeddingException extends Error {
  readonly code = 'INVALID_CHUNK_EMBEDDING'

  constructor() {
    super('Chunk embedding must contain finite numbers')
    this.name = 'InvalidChunkEmbeddingException'
  }
}
