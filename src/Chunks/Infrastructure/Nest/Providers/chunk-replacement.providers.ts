import { AuthorizeDocumentIndexChunkReplacementCommandHandlerContract } from '../../../../DocumentIndexes/Application/Contracts/authorize-document-index-chunk-replacement.command.handler.contract.ts'
import { ReplacePlannedDocumentRelationsCommandHandlerContract } from '../../../../DocumentRelations/Application/Contracts/replace-planned-document-relations.command.handler.contract.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import { ReplaceIndexChunkCommandHandler } from '../../../Application/Commands/replace-index-chunk.command.handler.ts'
import { ReplaceIndexChunkCommandHandlerContract } from '../../../Application/Contracts/replace-index-chunk.command.handler.contract.ts'
import { ChunkRepository as ChunkRepositoryContract } from '../../../Application/Ports/Out/Repositories/chunk.repository.ts'

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
