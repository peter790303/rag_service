import type { Chunk } from '../../Domain/Entities/chunk.ts'
import type { FindGraphChunkCandidatesQuery } from '../Queries/find-graph-chunk-candidates.query.ts'

export abstract class FindGraphChunkCandidatesQueryHandlerContract {
  abstract execute(findGraphChunkCandidatesDTO: FindGraphChunkCandidatesQuery): Promise<Chunk[]>
}
