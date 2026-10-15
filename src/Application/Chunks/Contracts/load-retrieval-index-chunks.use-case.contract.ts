import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { LoadRetrievalIndexChunksDto } from '../DataTransferObjects/load-retrieval-index-chunks.dto.ts'

export abstract class LoadRetrievalIndexChunksUseCaseContract {
  abstract execute(loadRetrievalIndexChunksDTO: LoadRetrievalIndexChunksDto): Promise<Chunk[]>
}
