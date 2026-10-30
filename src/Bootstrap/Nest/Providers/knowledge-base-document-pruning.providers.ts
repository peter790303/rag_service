import { StartDocumentIndexPruningRetentionCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/start-document-index-pruning-retention.command.handler.contract.ts'
import { CancelKnowledgeBaseDocumentDocumentIndexingListener } from '../../../DocumentIndexes/Application/Listeners/cancel-knowledge-base-document-document-indexing.listener.ts'
import { LockDocumentRetentionParentsCommandHandlerContract } from '../../../Documents/Application/Contracts/lock-document-retention-parents.command.handler.contract.ts'
import { StartDocumentPruningRetentionCommandHandlerContract } from '../../../Documents/Application/Contracts/start-document-pruning-retention.command.handler.contract.ts'
import { PruneKnowledgeBaseDocumentsCommandHandler } from '../../../KnowledgeBaseDocuments/Application/Commands/prune-knowledge-base-documents.command.handler.ts'
import { KnowledgeBaseDocumentPruningEventDelivery } from '../../../KnowledgeBaseDocuments/Application/Ports/Out/Gateways/knowledge-base-document-pruning-event.delivery.ts'
import { KnowledgeBaseDocumentRepository } from '../../../KnowledgeBaseDocuments/Application/Ports/Out/Repositories/knowledge-base-document.repository.ts'
import { ValidateKnowledgeBasePruningCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/validate-knowledge-base-pruning.command.handler.contract.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'

export const knowledgeBaseDocumentPruningProviders = [
  {
    provide: KnowledgeBaseDocumentPruningEventDelivery,
    useFactory: (
      listener: CancelKnowledgeBaseDocumentDocumentIndexingListener,
    ): KnowledgeBaseDocumentPruningEventDelivery => ({
      deliver: (event) => listener.handle(event),
    }),
    inject: [CancelKnowledgeBaseDocumentDocumentIndexingListener],
  },
  {
    provide: PruneKnowledgeBaseDocumentsCommandHandler,
    useFactory: (
      persistenceTransaction: PersistenceTransactionContract,
      validatePruningScope: ValidateKnowledgeBasePruningCommandHandlerContract,
      lockDocumentParents: LockDocumentRetentionParentsCommandHandlerContract,
      knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository,
      knowledgeBaseDocumentPruningEventDelivery: KnowledgeBaseDocumentPruningEventDelivery,
      startIndexRetention: StartDocumentIndexPruningRetentionCommandHandlerContract,
      startDocumentRetention: StartDocumentPruningRetentionCommandHandlerContract,
    ) =>
      new PruneKnowledgeBaseDocumentsCommandHandler(
        persistenceTransaction,
        validatePruningScope,
        lockDocumentParents,
        knowledgeBaseDocumentRepository,
        knowledgeBaseDocumentPruningEventDelivery,
        startIndexRetention,
        startDocumentRetention,
      ),
    inject: [
      PersistenceTransactionContract,
      ValidateKnowledgeBasePruningCommandHandlerContract,
      LockDocumentRetentionParentsCommandHandlerContract,
      KnowledgeBaseDocumentRepository,
      KnowledgeBaseDocumentPruningEventDelivery,
      StartDocumentIndexPruningRetentionCommandHandlerContract,
      StartDocumentPruningRetentionCommandHandlerContract,
    ],
  },
]
