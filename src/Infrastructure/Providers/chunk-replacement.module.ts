import { Module } from '@nestjs/common'

import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexingModule } from './document-indexing.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { ChunkRepository as ChunkRepositoryContract } from '../../Application/Chunks/Contracts/chunk.repository.ts'
import { ReplaceIndexChunkUseCaseContract } from '../../Application/Chunks/Contracts/replace-index-chunk.use-case.contract.ts'
import { ReplaceIndexChunkUseCase } from '../../Application/Chunks/UseCases/replace-index-chunk.use-case.ts'
import { PrepareChunkReplacementUseCaseContract } from '../../Application/DocumentIndexes/Contracts/prepare-chunk-replacement.use-case.contract.ts'
import { ReplacePlannedDocumentRelationsUseCaseContract } from '../../Application/DocumentRelations/Contracts/replace-planned-document-relations.use-case.contract.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../Application/KnowledgeBases/Contracts/persistence-transaction.ts'

@Module({
  imports: [PersistenceModule, DocumentIndexingModule, ChunksModule, DocumentRelationsModule],
  providers: [
    {
      provide: ReplaceIndexChunkUseCase,
      useFactory: (
        persistenceTransaction: PersistenceTransactionContract,
        prepareChunkReplacementUseCase: PrepareChunkReplacementUseCaseContract,
        chunkRepository: ChunkRepositoryContract,
        replacePlannedDocumentRelationsUseCase: ReplacePlannedDocumentRelationsUseCaseContract,
      ) =>
        new ReplaceIndexChunkUseCase(
          persistenceTransaction,
          prepareChunkReplacementUseCase,
          chunkRepository,
          replacePlannedDocumentRelationsUseCase,
        ),
      inject: [
        PersistenceTransactionContract,
        PrepareChunkReplacementUseCaseContract,
        ChunkRepositoryContract,
        ReplacePlannedDocumentRelationsUseCaseContract,
      ],
    },
    { provide: ReplaceIndexChunkUseCaseContract, useExisting: ReplaceIndexChunkUseCase },
  ],
  exports: [ReplaceIndexChunkUseCaseContract],
})
export class ChunkReplacementModule {}
