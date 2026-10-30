import { Module } from '@nestjs/common'

import { chunksProviders } from './chunks.providers.ts'
import { PersistenceModule } from './persistence.module.ts'
import { CollectIndexChunkGarbageCommandHandlerContract } from '../../../Chunks/Application/Contracts/collect-index-chunk-garbage.command.handler.contract.ts'
import { FindGraphChunkCandidatesQueryHandlerContract } from '../../../Chunks/Application/Contracts/find-graph-chunk-candidates.query.handler.contract.ts'
import { FindRetrievalChunkCandidatesQueryHandlerContract } from '../../../Chunks/Application/Contracts/find-retrieval-chunk-candidates.query.handler.contract.ts'
import { LoadGraphChunksQueryHandlerContract } from '../../../Chunks/Application/Contracts/load-graph-chunks.query.handler.contract.ts'
import { LoadRetrievalChunkContextQueryHandlerContract } from '../../../Chunks/Application/Contracts/load-retrieval-chunk-context.query.handler.contract.ts'
import { LoadRetrievalIndexChunksQueryHandlerContract } from '../../../Chunks/Application/Contracts/load-retrieval-index-chunks.query.handler.contract.ts'
import { ChunkRepository as ChunkRepositoryContract } from '../../../Chunks/Application/Ports/Out/Repositories/chunk.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: chunksProviders,
  exports: [
    LoadGraphChunksQueryHandlerContract,
    FindGraphChunkCandidatesQueryHandlerContract,
    ChunkRepositoryContract,
    CollectIndexChunkGarbageCommandHandlerContract,
    LoadRetrievalIndexChunksQueryHandlerContract,
    FindRetrievalChunkCandidatesQueryHandlerContract,
    LoadRetrievalChunkContextQueryHandlerContract,
  ],
})
export class ChunksModule {}
