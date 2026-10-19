import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import { InvalidChunkEmbeddingException } from '../Exceptions/invalid-chunk-embedding.exception.ts'
import { ChunkFactory } from '../Factories/chunk.factory.ts'

export interface ChunkSemanticQueryRowDTO {
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

export interface ChunkLexicalQueryRowDTO {
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
  readonly lexicalScore: number | string
}

/** Restores database vector matches without selecting or ranking candidates. */
export class ChunkSearchResultAdapter {
  static toVectorParameter(vector: readonly number[]): string {
    return JSON.stringify(vector)
  }

  static toLexicallyMatchedChunks(
    lexicalCandidateRows: readonly ChunkLexicalQueryRowDTO[],
    queryText: string,
  ): Chunk[] {
    return lexicalCandidateRows.map((row) => ChunkSearchResultAdapter.toLexicallyMatchedChunk(row, queryText))
  }

  static toVectorMatchedChunks(
    semanticCandidateRows: readonly ChunkSemanticQueryRowDTO[],
    queryVector: readonly number[],
  ): Chunk[] {
    return semanticCandidateRows.map((row) => ChunkSearchResultAdapter.toVectorMatchedChunk(row, queryVector))
  }

  private static toLexicallyMatchedChunk(row: ChunkLexicalQueryRowDTO, queryText: string): Chunk {
    const chunk = ChunkSearchResultAdapter.toChunk(row)
    chunk.recordLexicalSearchMatch(queryText, Number(row.lexicalScore))

    return chunk
  }

  private static toVectorMatchedChunk(row: ChunkSemanticQueryRowDTO, queryVector: readonly number[]): Chunk {
    const chunk = ChunkSearchResultAdapter.toChunk(row)
    chunk.recordVectorSearchMatch(queryVector, Number(row.candidateDistance))

    return chunk
  }

  private static toChunk(row: ChunkSemanticQueryRowDTO | ChunkLexicalQueryRowDTO): Chunk {
    return ChunkFactory.toChunk({
      id: row.id,
      documentIndexId: row.documentIndexId,
      ordinal: row.ordinal,
      headingPath: row.headingPath,
      content: row.content,
      tokenCount: row.tokenCount,
      embedding: ChunkSearchResultAdapter.toEmbeddingVector(row.embedding),
      searchVector: row.searchVector,
      blockStart: row.blockStart,
      blockEnd: row.blockEnd,
      createdAt: new Date(row.createdAt),
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
