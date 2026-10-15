export class InvalidChunkReplacementTimestampException extends Error {
  readonly code = 'INVALID_CHUNK_REPLACEMENT_TIMESTAMP'

  constructor() {
    super('Replacement time must be valid')
    this.name = 'InvalidChunkReplacementTimestampException'
  }
}
