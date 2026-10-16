import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import { RetrievalCandidateChunkAssembler } from '../Assemblers/retrieval-candidate-chunk.assembler.ts'
import type { ChunkRepository } from '../Contracts/chunk.repository.ts'
import { FindLexicalChunkCandidatesUseCaseContract } from '../Contracts/find-lexical-chunk-candidates.use-case.contract.ts'
import type { FindLexicalChunkCandidatesDto } from '../DataTransferObjects/find-lexical-chunk-candidates.dto.ts'

export class FindLexicalChunkCandidatesUseCase extends FindLexicalChunkCandidatesUseCaseContract {
  constructor(private readonly chunkRepository: ChunkRepository) {
    super()
  }

  async execute(findLexicalChunkCandidatesDTO: FindLexicalChunkCandidatesDto): Promise<Chunk[]> {
    return this.chunkRepository.findByDocumentIndexIdsOrderByLexicalScoreDescAndIdAsc(
      RetrievalCandidateChunkAssembler.toChunkLexicalSearchQueryObject(findLexicalChunkCandidatesDTO),
    )
  }
}
