export class InvalidChunkHeadingPathException extends Error {
  readonly code = 'INVALID_CHUNK_HEADING_PATH'

  constructor() {
    super('Chunk heading path must contain only strings')
    this.name = 'InvalidChunkHeadingPathException'
  }
}
