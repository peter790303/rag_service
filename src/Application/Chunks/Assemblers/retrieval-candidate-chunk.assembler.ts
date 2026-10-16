import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { FindLexicalChunkCandidatesDto } from '../DataTransferObjects/find-lexical-chunk-candidates.dto.ts'
import type { FindRetrievalChunkCandidatesDto } from '../DataTransferObjects/find-retrieval-chunk-candidates.dto.ts'
import type { RetrievalCandidateChunkMatchDto } from '../DataTransferObjects/retrieval-candidate-chunk-match.dto.ts'
import type {
  ChunkLexicalSearchQueryObject,
  ChunkVectorSimilarityQueryObject,
} from '../QueryObjects/chunk.query-object.ts'

export class RetrievalCandidateChunkAssembler {
  static toRetrievalCandidateChunkMatchDTOs(
    selectedCandidateChunks: readonly Chunk[],
    semanticCandidateChunks: readonly Chunk[],
    lexicalCandidateChunks: readonly Chunk[],
  ): RetrievalCandidateChunkMatchDto[] {
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
      new Map<string, NonNullable<RetrievalCandidateChunkMatchDto['lexicalMatch']>>(),
    )

    return selectedCandidateChunks.map((selectedCandidateChunk) => ({
      candidateChunk: selectedCandidateChunk,
      semanticRank: semanticRanksByChunkId.get(selectedCandidateChunk.id) ?? null,
      lexicalMatch: lexicalMatchesByChunkId.get(selectedCandidateChunk.id) ?? null,
    }))
  }

  static toFindLexicalChunkCandidatesDTO(
    findRetrievalChunkCandidatesDTO: FindRetrievalChunkCandidatesDto,
  ): FindLexicalChunkCandidatesDto {
    return {
      documentIndexIds: findRetrievalChunkCandidatesDTO.documentIndexIds,
      queryText: findRetrievalChunkCandidatesDTO.queryText,
      limit: findRetrievalChunkCandidatesDTO.limit,
    }
  }

  static toChunkLexicalSearchQueryObject(
    findLexicalChunkCandidatesDTO: FindLexicalChunkCandidatesDto,
  ): ChunkLexicalSearchQueryObject {
    return {
      documentIndexIds: findLexicalChunkCandidatesDTO.documentIndexIds,
      queryText: findLexicalChunkCandidatesDTO.queryText,
      limit: findLexicalChunkCandidatesDTO.limit,
    }
  }

  static toChunkVectorSimilarityQueryObject(
    findRetrievalChunkCandidatesDTO: FindRetrievalChunkCandidatesDto,
  ): ChunkVectorSimilarityQueryObject {
    return {
      documentIndexIds: findRetrievalChunkCandidatesDTO.documentIndexIds,
      queryVector: findRetrievalChunkCandidatesDTO.queryVector,
      limit: findRetrievalChunkCandidatesDTO.limit,
    }
  }
}
