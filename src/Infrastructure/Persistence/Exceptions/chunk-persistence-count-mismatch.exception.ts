export class ChunkPersistenceCountMismatchException extends Error {
  readonly code = 'CHUNK_PERSISTENCE_COUNT_MISMATCH'

  constructor(readonly context: { plannedChunkCount: number; embeddingCount: number; lexicalTextCount: number }) {
    super('Chunk persistence inputs must match the planned chunk count')
    this.name = 'ChunkPersistenceCountMismatchException'
  }
}
