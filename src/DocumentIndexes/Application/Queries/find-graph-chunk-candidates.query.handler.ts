import type { FindGraphChunkCandidatesQuery } from './find-graph-chunk-candidates.query.ts'
import type { Chunk } from '../../Domain/Entities/chunk.ts'
import { QueryGraphChunkAssembler } from '../Assemblers/query-graph-chunk.assembler.ts'
import { FindGraphChunkCandidatesQueryHandlerContract } from '../Contracts/find-graph-chunk-candidates.query.handler.contract.ts'
import type { ChunkRepository } from '../Ports/Out/Repositories/chunk.repository.ts'

/** Reuses the approved database cosine query within the caller's active project index scope. */
export class FindGraphChunkCandidatesQueryHandler extends FindGraphChunkCandidatesQueryHandlerContract {
  constructor(private readonly chunkRepository: ChunkRepository) {
    super()
  }

  async execute(findGraphChunkCandidatesDTO: FindGraphChunkCandidatesQuery): Promise<Chunk[]> {
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
