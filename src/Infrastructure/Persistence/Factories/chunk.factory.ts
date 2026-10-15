import { Chunk, type ChunkState } from '../../../Domain/Chunk/chunk.ts'

/** Restores a source passage through the same invariants used at creation. */
export class ChunkFactory {
  static toChunk(persistedChunk: ChunkState): Chunk {
    return new Chunk({
      id: persistedChunk.id,
      documentIndexId: persistedChunk.documentIndexId,
      ordinal: persistedChunk.ordinal,
      headingPath: persistedChunk.headingPath,
      content: persistedChunk.content,
      blockStart: persistedChunk.blockStart,
      blockEnd: persistedChunk.blockEnd,
      tokenCount: persistedChunk.tokenCount,
      embedding: persistedChunk.embedding,
      searchVector: persistedChunk.searchVector,
      createdAt: persistedChunk.createdAt,
    })
  }
}
