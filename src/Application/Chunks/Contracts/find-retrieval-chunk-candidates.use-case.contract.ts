import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { FindRetrievalChunkCandidatesDTO } from '../DataTransferObjects/find-retrieval-chunk-candidates.dto.ts'

export abstract class FindRetrievalChunkCandidatesUseCaseContract {
  abstract execute(findRetrievalChunkCandidatesDTO: FindRetrievalChunkCandidatesDTO): Promise<Chunk[]>
}
