import type { LoadRetrievalChunkContextQuery } from './load-retrieval-chunk-context.query.ts'
import type { Chunk } from '../../Domain/Entities/chunk.ts'
import { QueryRetrievalNeighborChunkAssembler } from '../Assemblers/query-retrieval-neighbor-chunk.assembler.ts'
import { RetrievalChunkContextAssembler } from '../Assemblers/retrieval-chunk-context.assembler.ts'
import { LoadRetrievalChunkContextQueryHandlerContract } from '../Contracts/load-retrieval-chunk-context.query.handler.contract.ts'
import type { ChunkRepository } from '../Ports/Out/Repositories/chunk.repository.ts'

/** Loads adjacent chunks only for selected roots within the active index scope. */
export class LoadRetrievalChunkContextQueryHandler extends LoadRetrievalChunkContextQueryHandlerContract {
  constructor(private readonly chunkRepository: ChunkRepository) {
    super()
  }

  async execute(loadRetrievalChunkContextDTO: LoadRetrievalChunkContextQuery): Promise<Chunk[]> {
    const validatedDTO = RetrievalChunkContextAssembler.toLoadRetrievalChunkContextDTO(loadRetrievalChunkContextDTO)
    const {
      candidates,
      rootChunkIds: rootChunkIdValues,
      activeDocumentIndexIds: activeDocumentIndexIdValues,
    } = validatedDTO
    const rootChunkIds = new Set(rootChunkIdValues)
    const activeDocumentIndexIds = new Set(activeDocumentIndexIdValues)
    const retrievalRootChunks = candidates.filter(
      (chunk) => rootChunkIds.has(chunk.id) && activeDocumentIndexIds.has(chunk.documentIndexId),
    )
    const neighboringOrdinalOffsets = [-1, 1]
    const chunkIndexOrdinalsQueries = QueryRetrievalNeighborChunkAssembler.toChunkIndexOrdinalsQueryObjects(
      retrievalRootChunks,
      neighboringOrdinalOffsets,
    )

    return (
      await Promise.all(
        chunkIndexOrdinalsQueries.map((chunkIndexOrdinalsQO) =>
          this.chunkRepository.findByDocumentIndexIdAndOrdinals(chunkIndexOrdinalsQO),
        ),
      )
    ).flat()
  }
}
