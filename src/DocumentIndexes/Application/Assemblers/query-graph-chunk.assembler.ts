import type { FindGraphChunkCandidatesDTO } from '../DataTransferObjects/load-graph-chunks.dto.ts'
import type {
  ChunkIndexOrdinalsQueryObject,
  ChunkVectorSimilarityQueryObject,
} from '../QueryObjects/chunk.query-object.ts'

export class QueryGraphChunkAssembler {
  static toChunkIndexOrdinalsQueryObject(documentIndexId: string): ChunkIndexOrdinalsQueryObject {
    return { documentIndexId, ordinals: [0, 1, 2] }
  }

  static toChunkVectorSimilarityQueryObject(
    findGraphChunkCandidatesDTO: FindGraphChunkCandidatesDTO,
  ): ChunkVectorSimilarityQueryObject {
    return {
      documentIndexIds: [...findGraphChunkCandidatesDTO.documentIndexIds],
      queryVector: [...findGraphChunkCandidatesDTO.queryVector],
      limit: findGraphChunkCandidatesDTO.limit,
    }
  }
}
