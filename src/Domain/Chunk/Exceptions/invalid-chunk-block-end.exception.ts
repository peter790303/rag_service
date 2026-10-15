export class InvalidChunkBlockEndException extends Error {
  readonly code = 'INVALID_CHUNK_BLOCK_END'

  constructor() {
    super('Chunk source block end must be a non-negative integer')
    this.name = 'InvalidChunkBlockEndException'
  }
}
