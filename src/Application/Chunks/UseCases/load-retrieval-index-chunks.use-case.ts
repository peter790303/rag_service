import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import { QueryRetrievalIndexChunkAssembler } from '../Assemblers/query-retrieval-index-chunk.assembler.ts'
import type { ChunkRepository } from '../Contracts/chunk.repository.ts'
import { LoadRetrievalIndexChunksUseCaseContract } from '../Contracts/load-retrieval-index-chunks.use-case.contract.ts'
import type { LoadRetrievalIndexChunksDTO } from '../DataTransferObjects/load-retrieval-index-chunks.dto.ts'

/** Loads complete chunks for both retrieval and counting scopes without reading an index twice. */
export class LoadRetrievalIndexChunksUseCase extends LoadRetrievalIndexChunksUseCaseContract {
  constructor(private readonly chunkRepository: ChunkRepository) {
    super()
  }

  async execute(loadRetrievalIndexChunksDTO: LoadRetrievalIndexChunksDTO): Promise<Chunk[]> {
    const { fullContentIndexIds, countedIndexIds } =
      QueryRetrievalIndexChunkAssembler.toLoadRetrievalIndexChunksDTO(loadRetrievalIndexChunksDTO)
    const uniqueFullContentDocumentIndexIds = [...new Set(fullContentIndexIds)]
    const countOnlyDocumentIndexIds = [...new Set(countedIndexIds)].filter(
      (documentIndexId) => !uniqueFullContentDocumentIndexIds.includes(documentIndexId),
    )
    const fullContentIndexIdsQO = QueryRetrievalIndexChunkAssembler.toChunkIndexIdsQueryObject(
      uniqueFullContentDocumentIndexIds,
    )
    const countOnlyIndexIdsQO = QueryRetrievalIndexChunkAssembler.toChunkIndexIdsQueryObject(countOnlyDocumentIndexIds)
    const fullContentDocumentIndexChunks =
      await this.chunkRepository.findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc(fullContentIndexIdsQO)
    const countedDocumentIndexChunks = await this.chunkRepository.findByDocumentIndexIds(countOnlyIndexIdsQO)
    const retrievedChunkIds = new Set<string>()

    return [...fullContentDocumentIndexChunks, ...countedDocumentIndexChunks].filter((chunk) => {
      if (retrievedChunkIds.has(chunk.id)) return false

      retrievedChunkIds.add(chunk.id)

      return true
    })
  }
}
