import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { CollectIndexChunkGarbageCommandHandler } from '../../../DocumentIndexes/Application/Commands/collect-index-chunk-garbage.command.handler.ts'
import { CollectIndexChunkGarbageCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/collect-index-chunk-garbage.command.handler.contract.ts'
import { FindGraphChunkCandidatesQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/find-graph-chunk-candidates.query.handler.contract.ts'
import { FindLexicalChunkCandidatesQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/find-lexical-chunk-candidates.query.handler.contract.ts'
import { FindRetrievalChunkCandidatesQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/find-retrieval-chunk-candidates.query.handler.contract.ts'
import { LoadGraphChunksQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-graph-chunks.query.handler.contract.ts'
import { LoadRetrievalChunkContextQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-retrieval-chunk-context.query.handler.contract.ts'
import { LoadRetrievalIndexChunksQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-retrieval-index-chunks.query.handler.contract.ts'
import { ChunkRepository as ChunkRepositoryContract } from '../../../DocumentIndexes/Application/Ports/Out/Repositories/chunk.repository.ts'
import { FindGraphChunkCandidatesQueryHandler } from '../../../DocumentIndexes/Application/Queries/find-graph-chunk-candidates.query.handler.ts'
import { FindLexicalChunkCandidatesQueryHandler } from '../../../DocumentIndexes/Application/Queries/find-lexical-chunk-candidates.query.handler.ts'
import { FindRetrievalChunkCandidatesQueryHandler } from '../../../DocumentIndexes/Application/Queries/find-retrieval-chunk-candidates.query.handler.ts'
import { LoadGraphChunksQueryHandler } from '../../../DocumentIndexes/Application/Queries/load-graph-chunks.query.handler.ts'
import { LoadRetrievalChunkContextQueryHandler } from '../../../DocumentIndexes/Application/Queries/load-retrieval-chunk-context.query.handler.ts'
import { LoadRetrievalIndexChunksQueryHandler } from '../../../DocumentIndexes/Application/Queries/load-retrieval-index-chunks.query.handler.ts'
import { ChunkRepository } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/chunk.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
    ChunkRepository,
    {
      provide: LoadGraphChunksQueryHandlerContract,
      useFactory: (repository: ChunkRepositoryContract) => new LoadGraphChunksQueryHandler(repository),
      inject: [ChunkRepositoryContract],
    },
    {
      provide: FindGraphChunkCandidatesQueryHandlerContract,
      useFactory: (repository: ChunkRepositoryContract) => new FindGraphChunkCandidatesQueryHandler(repository),
      inject: [ChunkRepositoryContract],
    },
    {
      provide: CollectIndexChunkGarbageCommandHandler,
      useFactory: (chunkRepository: ChunkRepositoryContract) =>
        new CollectIndexChunkGarbageCommandHandler(chunkRepository),
      inject: [ChunkRepositoryContract],
    },
    {
      provide: FindLexicalChunkCandidatesQueryHandler,
      useFactory: (chunkRepository: ChunkRepositoryContract) =>
        new FindLexicalChunkCandidatesQueryHandler(chunkRepository),
      inject: [ChunkRepositoryContract],
    },
    {
      provide: FindRetrievalChunkCandidatesQueryHandler,
      useFactory: (
        chunkRepository: ChunkRepositoryContract,
        lexicalChunkCandidates: FindLexicalChunkCandidatesQueryHandlerContract,
      ) => new FindRetrievalChunkCandidatesQueryHandler(chunkRepository, lexicalChunkCandidates),
      inject: [ChunkRepositoryContract, FindLexicalChunkCandidatesQueryHandlerContract],
    },
    {
      provide: LoadRetrievalChunkContextQueryHandler,
      useFactory: (repository: ChunkRepositoryContract) => new LoadRetrievalChunkContextQueryHandler(repository),
      inject: [ChunkRepositoryContract],
    },
    {
      provide: LoadRetrievalIndexChunksQueryHandler,
      useFactory: (repository: ChunkRepositoryContract) => new LoadRetrievalIndexChunksQueryHandler(repository),
      inject: [ChunkRepositoryContract],
    },
    { provide: CollectIndexChunkGarbageCommandHandlerContract, useExisting: CollectIndexChunkGarbageCommandHandler },
    { provide: FindLexicalChunkCandidatesQueryHandlerContract, useExisting: FindLexicalChunkCandidatesQueryHandler },
    {
      provide: FindRetrievalChunkCandidatesQueryHandlerContract,
      useExisting: FindRetrievalChunkCandidatesQueryHandler,
    },
    { provide: LoadRetrievalChunkContextQueryHandlerContract, useExisting: LoadRetrievalChunkContextQueryHandler },
    { provide: LoadRetrievalIndexChunksQueryHandlerContract, useExisting: LoadRetrievalIndexChunksQueryHandler },
    { provide: ChunkRepositoryContract, useExisting: ChunkRepository },
  ],
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
