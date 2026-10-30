export class InvalidChunkRetrievalMatchException extends Error {
  readonly code = 'INVALID_CHUNK_RETRIEVAL_MATCH'

  constructor() {
    super('Chunk retrieval requires finite scores and positive ranks for at least one channel')
    this.name = 'InvalidChunkRetrievalMatchException'
  }
}
