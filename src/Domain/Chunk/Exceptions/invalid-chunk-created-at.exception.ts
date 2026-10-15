export class InvalidChunkCreatedAtException extends Error {
  readonly code = 'INVALID_CHUNK_CREATED_AT'

  constructor() {
    super('Chunk creation time must be a valid date')
    this.name = 'InvalidChunkCreatedAtException'
  }
}
