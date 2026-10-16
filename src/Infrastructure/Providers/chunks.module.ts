import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { ChunkRepository as ChunkRepositoryContract } from '../../Application/Chunks/Contracts/chunk.repository.ts'
import { CollectIndexChunkGarbageUseCaseContract } from '../../Application/Chunks/Contracts/collect-index-chunk-garbage.use-case.contract.ts'
import { FindLexicalChunkCandidatesUseCaseContract } from '../../Application/Chunks/Contracts/find-lexical-chunk-candidates.use-case.contract.ts'
import { FindRetrievalChunkCandidatesUseCaseContract } from '../../Application/Chunks/Contracts/find-retrieval-chunk-candidates.use-case.contract.ts'
import { LoadRetrievalChunkContextUseCaseContract } from '../../Application/Chunks/Contracts/load-retrieval-chunk-context.use-case.contract.ts'
import { LoadRetrievalIndexChunksUseCaseContract } from '../../Application/Chunks/Contracts/load-retrieval-index-chunks.use-case.contract.ts'
import { CollectIndexChunkGarbageUseCase } from '../../Application/Chunks/UseCases/collect-index-chunk-garbage.use-case.ts'
import { FindLexicalChunkCandidatesUseCase } from '../../Application/Chunks/UseCases/find-lexical-chunk-candidates.use-case.ts'
import { FindRetrievalChunkCandidatesUseCase } from '../../Application/Chunks/UseCases/find-retrieval-chunk-candidates.use-case.ts'
import { LoadRetrievalChunkContextUseCase } from '../../Application/Chunks/UseCases/load-retrieval-chunk-context.use-case.ts'
import { LoadRetrievalIndexChunksUseCase } from '../../Application/Chunks/UseCases/load-retrieval-index-chunks.use-case.ts'
import { ChunkRepository } from '../Persistence/Repositories/chunk.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
    ChunkRepository,
    {
      provide: CollectIndexChunkGarbageUseCase,
      useFactory: (chunkRepository: ChunkRepositoryContract) => new CollectIndexChunkGarbageUseCase(chunkRepository),
      inject: [ChunkRepositoryContract],
    },
    {
      provide: FindLexicalChunkCandidatesUseCase,
      useFactory: (chunkRepository: ChunkRepositoryContract) => new FindLexicalChunkCandidatesUseCase(chunkRepository),
      inject: [ChunkRepositoryContract],
    },
    {
      provide: FindRetrievalChunkCandidatesUseCase,
      useFactory: (
        chunkRepository: ChunkRepositoryContract,
        lexicalChunkCandidates: FindLexicalChunkCandidatesUseCaseContract,
      ) => new FindRetrievalChunkCandidatesUseCase(chunkRepository, lexicalChunkCandidates),
      inject: [ChunkRepositoryContract, FindLexicalChunkCandidatesUseCaseContract],
    },
    {
      provide: LoadRetrievalChunkContextUseCase,
      useFactory: (repository: ChunkRepositoryContract) => new LoadRetrievalChunkContextUseCase(repository),
      inject: [ChunkRepositoryContract],
    },
    {
      provide: LoadRetrievalIndexChunksUseCase,
      useFactory: (repository: ChunkRepositoryContract) => new LoadRetrievalIndexChunksUseCase(repository),
      inject: [ChunkRepositoryContract],
    },
    { provide: CollectIndexChunkGarbageUseCaseContract, useExisting: CollectIndexChunkGarbageUseCase },
    { provide: FindLexicalChunkCandidatesUseCaseContract, useExisting: FindLexicalChunkCandidatesUseCase },
    { provide: FindRetrievalChunkCandidatesUseCaseContract, useExisting: FindRetrievalChunkCandidatesUseCase },
    { provide: LoadRetrievalChunkContextUseCaseContract, useExisting: LoadRetrievalChunkContextUseCase },
    { provide: LoadRetrievalIndexChunksUseCaseContract, useExisting: LoadRetrievalIndexChunksUseCase },
    { provide: ChunkRepositoryContract, useExisting: ChunkRepository },
  ],
  exports: [
    ChunkRepositoryContract,
    CollectIndexChunkGarbageUseCaseContract,
    LoadRetrievalIndexChunksUseCaseContract,
    FindRetrievalChunkCandidatesUseCaseContract,
    LoadRetrievalChunkContextUseCaseContract,
  ],
})
export class ChunksModule {}
