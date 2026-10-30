import type { Chunk } from '../../Domain/Entities/chunk.ts'
import type { RetrievalCandidateChunkMatchDTO } from '../DTOs/retrieval-candidate-chunk-match.dto.ts'
import type { FindLexicalChunkCandidatesQuery } from '../Queries/find-lexical-chunk-candidates.query.ts'
import type { FindRetrievalChunkCandidatesQuery } from '../Queries/find-retrieval-chunk-candidates.query.ts'
import type { ChunkLexicalSearchQO, ChunkVectorSimilarityQO } from '../QueryObjects/chunk.query-object.ts'

export class RetrievalCandidateChunkAssembler {
  static toRetrievalCandidateChunkMatchDTOs(
    selectedCandidateChunks: readonly Chunk[],
    semanticCandidateChunks: readonly Chunk[],
    lexicalCandidateChunks: readonly Chunk[],
  ): RetrievalCandidateChunkMatchDTO[] {
    const semanticRanksByChunkId = semanticCandidateChunks.reduce(
      (semanticRanksByChunkId, semanticCandidateChunk, offset) => {
        if (!semanticRanksByChunkId.has(semanticCandidateChunk.id)) {
          semanticRanksByChunkId.set(semanticCandidateChunk.id, offset + 1)
        }

        return semanticRanksByChunkId
      },
      new Map<string, number>(),
    )
    const lexicalMatchesByChunkId = lexicalCandidateChunks.reduce(
      (lexicalMatchesByChunkId, lexicalCandidateChunk, offset) => {
        if (!lexicalMatchesByChunkId.has(lexicalCandidateChunk.id)) {
          lexicalMatchesByChunkId.set(lexicalCandidateChunk.id, {
            candidateChunk: lexicalCandidateChunk,
            rank: offset + 1,
          })
        }

        return lexicalMatchesByChunkId
      },
      new Map<string, NonNullable<RetrievalCandidateChunkMatchDTO['lexicalMatch']>>(),
    )

    return selectedCandidateChunks.map((selectedCandidateChunk) => ({
      candidateChunk: selectedCandidateChunk,
      semanticRank: semanticRanksByChunkId.get(selectedCandidateChunk.id) ?? null,
      lexicalMatch: lexicalMatchesByChunkId.get(selectedCandidateChunk.id) ?? null,
    }))
  }

  static toFindLexicalChunkCandidatesQuery(
    findRetrievalChunkCandidatesQuery: FindRetrievalChunkCandidatesQuery,
  ): FindLexicalChunkCandidatesQuery {
    return {
      documentIndexIds: findRetrievalChunkCandidatesQuery.documentIndexIds,
      queryText: findRetrievalChunkCandidatesQuery.queryText,
      limit: findRetrievalChunkCandidatesQuery.limit,
    }
  }

  static toChunkLexicalSearchQO(
    findLexicalChunkCandidatesQuery: FindLexicalChunkCandidatesQuery,
  ): ChunkLexicalSearchQO {
    return {
      documentIndexIds: findLexicalChunkCandidatesQuery.documentIndexIds,
      queryText: findLexicalChunkCandidatesQuery.queryText,
      limit: findLexicalChunkCandidatesQuery.limit,
    }
  }

  static toChunkVectorSimilarityQO(
    findRetrievalChunkCandidatesQuery: FindRetrievalChunkCandidatesQuery,
  ): ChunkVectorSimilarityQO {
    return {
      documentIndexIds: findRetrievalChunkCandidatesQuery.documentIndexIds,
      queryVector: findRetrievalChunkCandidatesQuery.queryVector,
      limit: findRetrievalChunkCandidatesQuery.limit,
    }
  }
}
