import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { LoadRetrievalChunkContextDTO } from '../DataTransferObjects/load-retrieval-chunk-context.dto.ts'

export abstract class LoadRetrievalChunkContextUseCaseContract {
  abstract execute(loadRetrievalChunkContextDTO: LoadRetrievalChunkContextDTO): Promise<Chunk[]>
}
