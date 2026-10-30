export class InvalidChunkOrdinalException extends Error {
  readonly code = 'INVALID_CHUNK_ORDINAL'

  constructor() {
    super('Chunk ordinal must be a non-negative integer')
    this.name = 'InvalidChunkOrdinalException'
  }
}
