import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import { RetrievalCandidateChunkAssembler } from '../Assemblers/retrieval-candidate-chunk.assembler.ts'
import type { ChunkRepository } from '../Contracts/chunk.repository.ts'
import type { FindLexicalChunkCandidatesUseCaseContract } from '../Contracts/find-lexical-chunk-candidates.use-case.contract.ts'
import { FindRetrievalChunkCandidatesUseCaseContract } from '../Contracts/find-retrieval-chunk-candidates.use-case.contract.ts'
import type { FindRetrievalChunkCandidatesDto } from '../DataTransferObjects/find-retrieval-chunk-candidates.dto.ts'

export class FindRetrievalChunkCandidatesUseCase extends FindRetrievalChunkCandidatesUseCaseContract {
  constructor(
    private readonly chunkRepository: ChunkRepository,
    private readonly findLexicalChunkCandidatesUseCase: FindLexicalChunkCandidatesUseCaseContract,
  ) {
    super()
  }

  async execute(findRetrievalChunkCandidatesDTO: FindRetrievalChunkCandidatesDto): Promise<Chunk[]> {
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

    const { queryVector, terms } = findRetrievalChunkCandidatesDTO
    retrievalCandidateChunkMatches.forEach(({ candidateChunk, semanticRank, lexicalMatch }) => {
      if (lexicalMatch) {
        candidateChunk.recordLexicalSearchMatch(terms, lexicalMatch.candidateChunk.requireLexicalSearchScoreFor(terms))
      }

      candidateChunk.recordRetrievalMatch(queryVector, terms, semanticRank, lexicalMatch?.rank ?? null)
    })

    return selectedCandidateChunks
  }
}
