import type { Chunk } from '../../Domain/Entities/chunk.ts'
import type { ChunkIndexOrdinalsQueryObject } from '../QueryObjects/chunk.query-object.ts'

/** Groups query coordinates after the caller has selected eligible roots and the neighbor range. */
export class QueryRetrievalNeighborChunkAssembler {
  static toChunkIndexOrdinalsQueryObjects(
    retrievalRootChunks: readonly Chunk[],
    neighboringOrdinalOffsets: readonly number[],
  ): ChunkIndexOrdinalsQueryObject[] {
    const ordinalsByDocumentIndexId = retrievalRootChunks.reduce((groupedOrdinals, retrievalRootChunk) => {
      const neighboringOrdinals = neighboringOrdinalOffsets
        .map((ordinalOffset) => retrievalRootChunk.ordinal + ordinalOffset)
        .filter((neighboringOrdinal) => neighboringOrdinal >= 0)

      if (neighboringOrdinals.length > 0) {
        groupedOrdinals.set(
          retrievalRootChunk.documentIndexId,
          new Set([...(groupedOrdinals.get(retrievalRootChunk.documentIndexId) ?? []), ...neighboringOrdinals]),
        )
      }

      return groupedOrdinals
    }, new Map<string, Set<number>>())

    return [...ordinalsByDocumentIndexId].map(([documentIndexId, ordinals]) => ({
      documentIndexId,
      ordinals: [...ordinals],
    }))
  }
}
