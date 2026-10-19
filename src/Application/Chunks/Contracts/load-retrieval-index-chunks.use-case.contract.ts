import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { LoadRetrievalIndexChunksDTO } from '../DataTransferObjects/load-retrieval-index-chunks.dto.ts'

export abstract class LoadRetrievalIndexChunksUseCaseContract {
  abstract execute(loadRetrievalIndexChunksDTO: LoadRetrievalIndexChunksDTO): Promise<Chunk[]>
}
