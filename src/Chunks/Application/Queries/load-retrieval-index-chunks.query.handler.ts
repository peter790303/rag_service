import type { LoadRetrievalIndexChunksQuery } from './load-retrieval-index-chunks.query.ts'
import type { Chunk } from '../../Domain/Entities/chunk.ts'
import { QueryRetrievalIndexChunkAssembler } from '../Assemblers/query-retrieval-index-chunk.assembler.ts'
import { LoadRetrievalIndexChunksQueryHandlerContract } from '../Contracts/load-retrieval-index-chunks.query.handler.contract.ts'
import type { ChunkRepository } from '../Ports/Out/Repositories/chunk.repository.ts'

/** Loads complete chunks for both retrieval and counting scopes without reading an index twice. */
export class LoadRetrievalIndexChunksQueryHandler extends LoadRetrievalIndexChunksQueryHandlerContract {
  constructor(private readonly chunkRepository: ChunkRepository) {
    super()
  }

  async execute(loadRetrievalIndexChunksQuery: LoadRetrievalIndexChunksQuery): Promise<Chunk[]> {
    const { fullContentIndexIds, countedIndexIds } =
      QueryRetrievalIndexChunkAssembler.toLoadRetrievalIndexChunksQuery(loadRetrievalIndexChunksQuery)
    const uniqueFullContentDocumentIndexIds = [...new Set(fullContentIndexIds)]
    const countOnlyDocumentIndexIds = [...new Set(countedIndexIds)].filter(
      (documentIndexId) => !uniqueFullContentDocumentIndexIds.includes(documentIndexId),
    )
    const fullContentIndexIdsQO = QueryRetrievalIndexChunkAssembler.toChunkIndexIdsQO(uniqueFullContentDocumentIndexIds)
    const countOnlyIndexIdsQO = QueryRetrievalIndexChunkAssembler.toChunkIndexIdsQO(countOnlyDocumentIndexIds)
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
