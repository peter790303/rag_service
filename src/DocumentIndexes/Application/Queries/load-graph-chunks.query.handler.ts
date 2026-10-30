import type { LoadGraphChunksQuery } from './load-graph-chunks.query.ts'
import type { Chunk } from '../../Domain/Entities/chunk.ts'
import { QueryGraphChunkAssembler } from '../Assemblers/query-graph-chunk.assembler.ts'
import { LoadGraphChunksQueryHandlerContract } from '../Contracts/load-graph-chunks.query.handler.contract.ts'
import type { ChunkRepository } from '../Ports/Out/Repositories/chunk.repository.ts'

/** At most three representative persisted chunks per selected document; no embedding work. */
export class LoadGraphChunksQueryHandler extends LoadGraphChunksQueryHandlerContract {
  constructor(private readonly chunkRepository: ChunkRepository) {
    super()
  }

  async execute(loadGraphChunksDTO: LoadGraphChunksQuery): Promise<Chunk[]> {
    const documentIndexIds = [...new Set(loadGraphChunksDTO.documentIndexIds)].slice(0, 100)

    return (
      await Promise.all(
        documentIndexIds.map((documentIndexId) => {
          const chunkIndexOrdinalsQO = QueryGraphChunkAssembler.toChunkIndexOrdinalsQueryObject(documentIndexId)

          return this.chunkRepository.findByDocumentIndexIdAndOrdinals(chunkIndexOrdinalsQO)
        }),
      )
    ).flat()
  }
}
