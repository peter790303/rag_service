export class ChunkVectorSearchMatchMissingException extends Error {
  readonly code = 'CHUNK_VECTOR_SEARCH_MATCH_MISSING'

  constructor() {
    super('Chunk has no vector search match for the requested query')
    this.name = 'ChunkVectorSearchMatchMissingException'
  }
}
