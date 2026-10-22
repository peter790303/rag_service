import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { FindGraphChunkCandidatesDTO } from '../DataTransferObjects/load-graph-chunks.dto.ts'

export abstract class FindGraphChunkCandidatesUseCaseContract {
  abstract execute(findGraphChunkCandidatesDTO: FindGraphChunkCandidatesDTO): Promise<Chunk[]>
}
