export class InvalidChunkSearchVectorException extends Error {
  readonly code = 'INVALID_CHUNK_SEARCH_VECTOR'

  constructor() {
    super('Chunk search vector must be a string or null')
    this.name = 'InvalidChunkSearchVectorException'
  }
}
