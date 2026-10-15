import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import { FindLexicalChunkCandidatesUseCaseContract } from '../Contracts/find-lexical-chunk-candidates.use-case.contract.ts'
import type { FindLexicalChunkCandidatesDto } from '../DataTransferObjects/find-lexical-chunk-candidates.dto.ts'
import { LexicalRankingUnavailableException } from '../Exceptions/lexical-ranking-unavailable.exception.ts'

export class FindLexicalChunkCandidatesUseCase extends FindLexicalChunkCandidatesUseCaseContract {
  async execute(findLexicalChunkCandidatesDTO: FindLexicalChunkCandidatesDto): Promise<Chunk[]> {
    if (
      !findLexicalChunkCandidatesDTO.documentIndexIds.length ||
      !findLexicalChunkCandidatesDTO.terms.length ||
      findLexicalChunkCandidatesDTO.limit <= 0
    )
      return []

    throw new LexicalRankingUnavailableException()
  }
}
