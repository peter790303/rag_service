import { Module } from '@nestjs/common'

import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexingModule } from './document-indexing.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { ReplaceIndexChunkCommandHandler } from '../../../DocumentIndexes/Application/Commands/replace-index-chunk.command.handler.ts'
import { AuthorizeDocumentIndexChunkReplacementCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/authorize-document-index-chunk-replacement.command.handler.contract.ts'
import { ReplaceIndexChunkCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/replace-index-chunk.command.handler.contract.ts'
import { ChunkRepository as ChunkRepositoryContract } from '../../../DocumentIndexes/Application/Ports/Out/Repositories/chunk.repository.ts'
import { ReplacePlannedDocumentRelationsCommandHandlerContract } from '../../../Documents/Application/Contracts/replace-planned-document-relations.command.handler.contract.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'

@Module({
  imports: [PersistenceModule, DocumentIndexingModule, ChunksModule, DocumentRelationsModule],
  providers: [
    {
      provide: ReplaceIndexChunkCommandHandler,
      useFactory: (
        persistenceTransaction: PersistenceTransactionContract,
        authorizeChunkReplacementUseCase: AuthorizeDocumentIndexChunkReplacementCommandHandlerContract,
        chunkRepository: ChunkRepositoryContract,
        replacePlannedDocumentRelationsUseCase: ReplacePlannedDocumentRelationsCommandHandlerContract,
      ) =>
        new ReplaceIndexChunkCommandHandler(
          persistenceTransaction,
          authorizeChunkReplacementUseCase,
          chunkRepository,
          replacePlannedDocumentRelationsUseCase,
        ),
      inject: [
        PersistenceTransactionContract,
        AuthorizeDocumentIndexChunkReplacementCommandHandlerContract,
        ChunkRepositoryContract,
        ReplacePlannedDocumentRelationsCommandHandlerContract,
      ],
    },
    { provide: ReplaceIndexChunkCommandHandlerContract, useExisting: ReplaceIndexChunkCommandHandler },
  ],
  exports: [ReplaceIndexChunkCommandHandlerContract],
})
export class ChunkReplacementModule {}
