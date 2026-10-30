import type { FindRetrievalChunkCandidatesQuery } from './find-retrieval-chunk-candidates.query.ts'
import type { Chunk } from '../../Domain/Entities/chunk.ts'
import { RetrievalCandidateChunkAssembler } from '../Assemblers/retrieval-candidate-chunk.assembler.ts'
import type { FindLexicalChunkCandidatesQueryHandlerContract } from '../Contracts/find-lexical-chunk-candidates.query.handler.contract.ts'
import { FindRetrievalChunkCandidatesQueryHandlerContract } from '../Contracts/find-retrieval-chunk-candidates.query.handler.contract.ts'
import type { ChunkRepository } from '../Ports/Out/Repositories/chunk.repository.ts'

export class FindRetrievalChunkCandidatesQueryHandler extends FindRetrievalChunkCandidatesQueryHandlerContract {
  constructor(
    private readonly chunkRepository: ChunkRepository,
    private readonly findLexicalChunkCandidatesUseCase: FindLexicalChunkCandidatesQueryHandlerContract,
  ) {
    super()
  }

  async execute(findRetrievalChunkCandidatesDTO: FindRetrievalChunkCandidatesQuery): Promise<Chunk[]> {
    const lexicalCandidateChunks = await this.findLexicalChunkCandidatesUseCase.execute(
      RetrievalCandidateChunkAssembler.toFindLexicalChunkCandidatesDTO(findRetrievalChunkCandidatesDTO),
    )
    const semanticCandidateChunks =
      await this.chunkRepository.findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc(
        RetrievalCandidateChunkAssembler.toChunkVectorSimilarityQueryObject(findRetrievalChunkCandidatesDTO),
      )

    // Semantic candidates take precedence; each channel retains its first Entity for a repeated ID.
    const selectedCandidateChunksById = [...semanticCandidateChunks, ...lexicalCandidateChunks].reduce(
      (selectedCandidateChunksById, candidateChunk) => {
        if (!selectedCandidateChunksById.has(candidateChunk.id)) {
          selectedCandidateChunksById.set(candidateChunk.id, candidateChunk)
        }

        return selectedCandidateChunksById
      },
      new Map<string, Chunk>(),
    )
    const selectedCandidateChunks = [...selectedCandidateChunksById.values()]
    const retrievalCandidateChunkMatches = RetrievalCandidateChunkAssembler.toRetrievalCandidateChunkMatchDTOs(
      selectedCandidateChunks,
      semanticCandidateChunks,
      lexicalCandidateChunks,
    )

    const { queryVector, queryText } = findRetrievalChunkCandidatesDTO
    retrievalCandidateChunkMatches.forEach(({ candidateChunk, semanticRank, lexicalMatch }) => {
      if (lexicalMatch) {
        candidateChunk.recordLexicalSearchMatch(
          queryText,
          lexicalMatch.candidateChunk.requireLexicalSearchScoreFor(queryText),
        )
      }

      candidateChunk.recordRetrievalMatch(queryVector, queryText, semanticRank, lexicalMatch?.rank ?? null)
    })

    return selectedCandidateChunks
  }
}
