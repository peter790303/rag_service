export class ChunkDocumentIndexRequiredException extends Error {
  readonly code = 'CHUNK_DOCUMENT_INDEX_REQUIRED'

  constructor() {
    super('Chunk document index id must be non-empty')
    this.name = 'ChunkDocumentIndexRequiredException'
  }
}
