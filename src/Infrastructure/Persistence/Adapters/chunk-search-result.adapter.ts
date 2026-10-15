import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import { InvalidChunkEmbeddingException } from '../Exceptions/invalid-chunk-embedding.exception.ts'
import { ChunkFactory } from '../Factories/chunk.factory.ts'

export interface ChunkSemanticQueryRowDto {
  readonly id: string
  readonly documentIndexId: string
  readonly ordinal: number
  readonly headingPath: string[]
  readonly content: string
  readonly tokenCount: number | null
  readonly embedding: string | number[]
  readonly searchVector: string | null
  readonly blockStart: number
  readonly blockEnd: number
  readonly createdAt: Date | string
  readonly candidateDistance: number | string
}

/** Restores database vector matches without selecting or ranking candidates. */
export class ChunkSearchResultAdapter {
  static toVectorMatchedChunks(
    semanticCandidateRows: readonly ChunkSemanticQueryRowDto[],
    queryVector: readonly number[],
  ): Chunk[] {
    return semanticCandidateRows.map((semanticCandidateRow) => {
      const chunk = ChunkFactory.toChunk({
        id: semanticCandidateRow.id,
        documentIndexId: semanticCandidateRow.documentIndexId,
        ordinal: semanticCandidateRow.ordinal,
        headingPath: semanticCandidateRow.headingPath,
        content: semanticCandidateRow.content,
        tokenCount: semanticCandidateRow.tokenCount,
        embedding: ChunkSearchResultAdapter.toEmbeddingVector(semanticCandidateRow.embedding),
        searchVector: semanticCandidateRow.searchVector,
        blockStart: semanticCandidateRow.blockStart,
        blockEnd: semanticCandidateRow.blockEnd,
        createdAt: new Date(semanticCandidateRow.createdAt),
      })
      chunk.recordVectorSearchMatch(queryVector, Number(semanticCandidateRow.candidateDistance))

      return chunk
    })
  }

  private static toEmbeddingVector(embedding: string | number[]): number[] {
    let coordinates: unknown

    try {
      coordinates = typeof embedding === 'string' ? JSON.parse(embedding) : embedding
    } catch (cause) {
      if (!(cause instanceof SyntaxError)) throw cause

      throw new InvalidChunkEmbeddingException()
    }

    if (
      !Array.isArray(coordinates) ||
      !coordinates.every(
        (coordinate: unknown): coordinate is number => typeof coordinate === 'number' && Number.isFinite(coordinate),
      )
    ) {
      throw new InvalidChunkEmbeddingException()
    }

    return coordinates
  }
}
