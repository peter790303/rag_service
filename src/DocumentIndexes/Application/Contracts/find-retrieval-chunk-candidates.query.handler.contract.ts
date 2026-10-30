import type { Chunk } from '../../Domain/Entities/chunk.ts'
import type { FindRetrievalChunkCandidatesQuery } from '../Queries/find-retrieval-chunk-candidates.query.ts'

export abstract class FindRetrievalChunkCandidatesQueryHandlerContract {
  abstract execute(findRetrievalChunkCandidatesDTO: FindRetrievalChunkCandidatesQuery): Promise<Chunk[]>
}
