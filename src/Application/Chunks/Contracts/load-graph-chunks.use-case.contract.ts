import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { LoadGraphChunksDTO } from '../DataTransferObjects/load-graph-chunks.dto.ts'

export abstract class LoadGraphChunksUseCaseContract {
  abstract execute(loadGraphChunksDTO: LoadGraphChunksDTO): Promise<Chunk[]>
}
