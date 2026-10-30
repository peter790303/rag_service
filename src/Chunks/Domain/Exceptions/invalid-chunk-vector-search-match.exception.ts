export class InvalidChunkVectorSearchMatchException extends Error {
  readonly code = 'INVALID_CHUNK_VECTOR_SEARCH_MATCH'

  constructor() {
    super('Chunk vector search requires a finite query vector and cosine distance')
    this.name = 'InvalidChunkVectorSearchMatchException'
  }
}
