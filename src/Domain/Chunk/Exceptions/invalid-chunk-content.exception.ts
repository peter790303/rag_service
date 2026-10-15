export class InvalidChunkContentException extends Error {
  readonly code = 'INVALID_CHUNK_CONTENT'

  constructor() {
    super('Chunk content must be a string')
    this.name = 'InvalidChunkContentException'
  }
}
