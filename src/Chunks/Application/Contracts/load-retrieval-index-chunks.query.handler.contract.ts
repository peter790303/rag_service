import type { Chunk } from '../../Domain/Entities/chunk.ts'
import type { LoadRetrievalIndexChunksQuery } from '../Queries/load-retrieval-index-chunks.query.ts'

export abstract class LoadRetrievalIndexChunksQueryHandlerContract {
  abstract execute(loadRetrievalIndexChunksQuery: LoadRetrievalIndexChunksQuery): Promise<Chunk[]>
}
