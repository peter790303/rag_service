import { Module } from '@nestjs/common'

import { DocumentIndexRetentionModule } from './document-index-retention.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRetentionModule } from './document-retention.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { StartDocumentIndexPruningRetentionUseCaseContract } from '../../Application/DocumentIndexes/Contracts/start-document-index-pruning-retention.use-case.contract.ts'
import { CancelKnowledgeBaseDocumentDocumentIndexingListener } from '../../Application/DocumentIndexes/Listeners/cancel-knowledge-base-document-document-indexing.listener.ts'
import { LockDocumentRetentionParentsUseCaseContract } from '../../Application/Documents/Contracts/lock-document-retention-parents.use-case.contract.ts'
import { StartDocumentPruningRetentionUseCaseContract } from '../../Application/Documents/Contracts/start-document-pruning-retention.use-case.contract.ts'
import { KnowledgeBaseDocumentPruningEventDelivery } from '../../Application/KnowledgeBaseDocuments/Contracts/knowledge-base-document-pruning-event.delivery.ts'
import { KnowledgeBaseDocumentRepository } from '../../Application/KnowledgeBaseDocuments/Contracts/knowledge-base-document.repository.ts'
import { PruneKnowledgeBaseDocumentsUseCase } from '../../Application/KnowledgeBaseDocuments/UseCases/prune-knowledge-base-documents.use-case.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../Application/KnowledgeBases/Contracts/persistence-transaction.ts'
import { ValidateKnowledgeBasePruningUseCaseContract } from '../../Application/KnowledgeBases/Contracts/validate-knowledge-base-pruning.use-case.contract.ts'

@Module({
  imports: [
    PersistenceModule,
    KnowledgeBasesModule,
    DocumentsModule,
    KnowledgeBaseDocumentsModule,
    DocumentIndexesModule,
    DocumentIndexRetentionModule,
    DocumentRetentionModule,
  ],
  providers: [
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
      provide: PruneKnowledgeBaseDocumentsUseCase,
      useFactory: (
        persistenceTransaction: PersistenceTransactionContract,
        validatePruningScope: ValidateKnowledgeBasePruningUseCaseContract,
        lockDocumentParents: LockDocumentRetentionParentsUseCaseContract,
        knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository,
        knowledgeBaseDocumentPruningEventDelivery: KnowledgeBaseDocumentPruningEventDelivery,
        startIndexRetention: StartDocumentIndexPruningRetentionUseCaseContract,
        startDocumentRetention: StartDocumentPruningRetentionUseCaseContract,
      ) =>
        new PruneKnowledgeBaseDocumentsUseCase(
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
        ValidateKnowledgeBasePruningUseCaseContract,
        LockDocumentRetentionParentsUseCaseContract,
        KnowledgeBaseDocumentRepository,
        KnowledgeBaseDocumentPruningEventDelivery,
        StartDocumentIndexPruningRetentionUseCaseContract,
        StartDocumentPruningRetentionUseCaseContract,
      ],
    },
  ],
  exports: [PruneKnowledgeBaseDocumentsUseCase],
})
export class KnowledgeBaseDocumentPruningModule {}
