import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import { QueryGraphChunkAssembler } from '../Assemblers/query-graph-chunk.assembler.ts'
import type { ChunkRepository } from '../Contracts/chunk.repository.ts'
import { LoadGraphChunksUseCaseContract } from '../Contracts/load-graph-chunks.use-case.contract.ts'
import type { LoadGraphChunksDTO } from '../DataTransferObjects/load-graph-chunks.dto.ts'

/** At most three representative persisted chunks per selected document; no embedding work. */
export class LoadGraphChunksUseCase extends LoadGraphChunksUseCaseContract {
  constructor(private readonly chunkRepository: ChunkRepository) {
    super()
  }

  async execute(loadGraphChunksDTO: LoadGraphChunksDTO): Promise<Chunk[]> {
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
