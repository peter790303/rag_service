import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import { QueryGraphChunkAssembler } from '../Assemblers/query-graph-chunk.assembler.ts'
import type { ChunkRepository } from '../Contracts/chunk.repository.ts'
import { FindGraphChunkCandidatesUseCaseContract } from '../Contracts/find-graph-chunk-candidates.use-case.contract.ts'
import type { FindGraphChunkCandidatesDTO } from '../DataTransferObjects/load-graph-chunks.dto.ts'

/** Reuses the approved database cosine query within the caller's active project index scope. */
export class FindGraphChunkCandidatesUseCase extends FindGraphChunkCandidatesUseCaseContract {
  constructor(private readonly chunkRepository: ChunkRepository) {
    super()
  }

  async execute(findGraphChunkCandidatesDTO: FindGraphChunkCandidatesDTO): Promise<Chunk[]> {
    if (findGraphChunkCandidatesDTO.documentIndexIds.length === 0) return []

    const boundedGraphCandidatesDTO = {
      ...findGraphChunkCandidatesDTO,
      limit: Math.max(1, Math.min(200, findGraphChunkCandidatesDTO.limit)),
    }
    const chunkVectorSimilarityQO =
      QueryGraphChunkAssembler.toChunkVectorSimilarityQueryObject(boundedGraphCandidatesDTO)

    return this.chunkRepository.findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc(chunkVectorSimilarityQO)
  }
}
