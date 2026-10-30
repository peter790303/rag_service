import type { FindGraphChunkCandidatesQuery } from '../Queries/find-graph-chunk-candidates.query.ts'
import type { ChunkIndexOrdinalsQO, ChunkVectorSimilarityQO } from '../QueryObjects/chunk.query-object.ts'

export class QueryGraphChunkAssembler {
  static toChunkIndexOrdinalsQO(documentIndexId: string): ChunkIndexOrdinalsQO {
    return { documentIndexId, ordinals: [0, 1, 2] }
  }

  static toChunkVectorSimilarityQO(
    findGraphChunkCandidatesQuery: FindGraphChunkCandidatesQuery,
  ): ChunkVectorSimilarityQO {
    return {
      documentIndexIds: [...findGraphChunkCandidatesQuery.documentIndexIds],
      queryVector: [...findGraphChunkCandidatesQuery.queryVector],
      limit: findGraphChunkCandidatesQuery.limit,
    }
  }
}
