export class InvalidChunkTokenCountException extends Error {
  readonly code = 'INVALID_CHUNK_TOKEN_COUNT'

  constructor() {
    super('Chunk token count must be null or a non-negative integer')
    this.name = 'InvalidChunkTokenCountException'
  }
}
