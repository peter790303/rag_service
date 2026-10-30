export class ChunkDocumentIndexMismatchException extends Error {
  readonly code = 'CHUNK_DOCUMENT_INDEX_MISMATCH'

  constructor() {
    super('Chunk belongs to a different document index')
    this.name = 'ChunkDocumentIndexMismatchException'
  }
}
