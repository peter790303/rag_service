import type { Chunk } from '../../Domain/Entities/chunk.ts'
import type { LoadGraphChunksQuery } from '../Queries/load-graph-chunks.query.ts'

export abstract class LoadGraphChunksQueryHandlerContract {
  abstract execute(loadGraphChunksQuery: LoadGraphChunksQuery): Promise<Chunk[]>
}
