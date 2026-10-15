export class InvalidChunkBlockStartException extends Error {
  readonly code = 'INVALID_CHUNK_BLOCK_START'

  constructor() {
    super('Chunk source block start must be a non-negative integer')
    this.name = 'InvalidChunkBlockStartException'
  }
}
