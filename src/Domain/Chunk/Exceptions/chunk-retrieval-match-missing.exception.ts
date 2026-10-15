export class ChunkRetrievalMatchMissingException extends Error {
  readonly code = 'CHUNK_RETRIEVAL_MATCH_MISSING'

  constructor() {
    super('Chunk has not been ranked for retrieval')
    this.name = 'ChunkRetrievalMatchMissingException'
  }
}
