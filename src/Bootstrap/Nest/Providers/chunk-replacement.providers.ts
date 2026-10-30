import { ReplaceIndexChunkCommandHandler } from '../../../Chunks/Application/Commands/replace-index-chunk.command.handler.ts'
import { ReplaceIndexChunkCommandHandlerContract } from '../../../Chunks/Application/Contracts/replace-index-chunk.command.handler.contract.ts'
import { ChunkRepository as ChunkRepositoryContract } from '../../../Chunks/Application/Ports/Out/Repositories/chunk.repository.ts'
import { AuthorizeDocumentIndexChunkReplacementCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/authorize-document-index-chunk-replacement.command.handler.contract.ts'
import { ReplacePlannedDocumentRelationsCommandHandlerContract } from '../../../DocumentRelations/Application/Contracts/replace-planned-document-relations.command.handler.contract.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'

export const chunkReplacementProviders = [
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
]
