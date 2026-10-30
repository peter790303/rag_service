import type { FindLexicalChunkCandidatesQuery } from './find-lexical-chunk-candidates.query.ts'
import type { Chunk } from '../../Domain/Entities/chunk.ts'
import { RetrievalCandidateChunkAssembler } from '../Assemblers/retrieval-candidate-chunk.assembler.ts'
import { FindLexicalChunkCandidatesQueryHandlerContract } from '../Contracts/find-lexical-chunk-candidates.query.handler.contract.ts'
import type { ChunkRepository } from '../Ports/Out/Repositories/chunk.repository.ts'

export class FindLexicalChunkCandidatesQueryHandler extends FindLexicalChunkCandidatesQueryHandlerContract {
  constructor(private readonly chunkRepository: ChunkRepository) {
    super()
  }

  async execute(findLexicalChunkCandidatesQuery: FindLexicalChunkCandidatesQuery): Promise<Chunk[]> {
    return this.chunkRepository.findByDocumentIndexIdsOrderByLexicalScoreDescAndIdAsc(
      RetrievalCandidateChunkAssembler.toChunkLexicalSearchQO(findLexicalChunkCandidatesQuery),
    )
  }
}
