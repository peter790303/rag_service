import type { Chunk } from '../../Domain/Entities/chunk.ts'
import type { LoadRetrievalChunkContextQuery } from '../Queries/load-retrieval-chunk-context.query.ts'

export abstract class LoadRetrievalChunkContextQueryHandlerContract {
  abstract execute(loadRetrievalChunkContextDTO: LoadRetrievalChunkContextQuery): Promise<Chunk[]>
}
