import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import { QueryRetrievalNeighborChunkAssembler } from '../Assemblers/query-retrieval-neighbor-chunk.assembler.ts'
import type { ChunkRepository } from '../Contracts/chunk.repository.ts'
import { LoadRetrievalChunkContextUseCaseContract } from '../Contracts/load-retrieval-chunk-context.use-case.contract.ts'
import type { LoadRetrievalChunkContextDto } from '../DataTransferObjects/load-retrieval-chunk-context.dto.ts'

/** Loads adjacent chunks only for selected roots within the active index scope. */
export class LoadRetrievalChunkContextUseCase extends LoadRetrievalChunkContextUseCaseContract {
  constructor(private readonly chunkRepository: ChunkRepository) {
    super()
  }

  async execute(loadRetrievalChunkContextDTO: LoadRetrievalChunkContextDto): Promise<Chunk[]> {
    const { candidates } = loadRetrievalChunkContextDTO
    const rootChunkIds = new Set(loadRetrievalChunkContextDTO.rootChunkIds)
    const activeDocumentIndexIds = new Set(loadRetrievalChunkContextDTO.activeDocumentIndexIds)
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
