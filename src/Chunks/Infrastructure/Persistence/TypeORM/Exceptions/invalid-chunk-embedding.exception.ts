export class InvalidChunkEmbeddingException extends Error {
  readonly code = 'INVALID_CHUNK_EMBEDDING'

  constructor() {
    super('Chunk embedding must contain finite numeric coordinates')
    this.name = 'InvalidChunkEmbeddingException'
  }
}
