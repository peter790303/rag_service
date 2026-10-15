import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { LoadRetrievalChunkContextDto } from '../DataTransferObjects/load-retrieval-chunk-context.dto.ts'

export abstract class LoadRetrievalChunkContextUseCaseContract {
  abstract execute(loadRetrievalChunkContextDTO: LoadRetrievalChunkContextDto): Promise<Chunk[]>
}
