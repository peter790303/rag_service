import { Module } from '@nestjs/common'

import { DocumentIndexRetentionModule } from './document-index-retention.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRetentionModule } from './document-retention.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { MembershipsModule } from './memberships.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { DocumentIndexExecutionQueue } from '../../Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import { StartDocumentIndexPruningRetentionUseCaseContract } from '../../Application/DocumentIndexes/Contracts/start-document-index-pruning-retention.use-case.contract.ts'
import { LockDocumentRetentionParentsUseCaseContract } from '../../Application/Documents/Contracts/lock-document-retention-parents.use-case.contract.ts'
import { StartDocumentPruningRetentionUseCaseContract } from '../../Application/Documents/Contracts/start-document-pruning-retention.use-case.contract.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../Application/KnowledgeBases/Contracts/persistence-transaction.ts'
import { ValidateKnowledgeBasePruningUseCaseContract } from '../../Application/KnowledgeBases/Contracts/validate-knowledge-base-pruning.use-case.contract.ts'
import { MembershipRepository } from '../../Application/Memberships/Contracts/membership.repository.ts'
import { CancelMembershipIndexingListener } from '../../Application/Memberships/Listeners/cancel-membership-indexing.listener.ts'
import { PruneKnowledgeBaseMembershipsUseCase } from '../../Application/Memberships/UseCases/prune-knowledge-base-memberships.use-case.ts'

@Module({
  imports: [
    PersistenceModule,
    KnowledgeBasesModule,
    DocumentsModule,
    MembershipsModule,
    DocumentIndexesModule,
    DocumentIndexRetentionModule,
    DocumentRetentionModule,
  ],
  providers: [
    {
      provide: CancelMembershipIndexingListener,
      useFactory: (documentIndexExecutionQueue: DocumentIndexExecutionQueue) =>
        new CancelMembershipIndexingListener(documentIndexExecutionQueue),
      inject: [DocumentIndexExecutionQueue],
    },
    {
      provide: PruneKnowledgeBaseMembershipsUseCase,
      useFactory: (
        persistenceTransaction: PersistenceTransactionContract,
        validatePruningScope: ValidateKnowledgeBasePruningUseCaseContract,
        lockDocumentParents: LockDocumentRetentionParentsUseCaseContract,
        membershipRepository: MembershipRepository,
        cancelMembershipIndexing: CancelMembershipIndexingListener,
        startIndexRetention: StartDocumentIndexPruningRetentionUseCaseContract,
        startDocumentRetention: StartDocumentPruningRetentionUseCaseContract,
      ) =>
        new PruneKnowledgeBaseMembershipsUseCase(
          persistenceTransaction,
          validatePruningScope,
          lockDocumentParents,
          membershipRepository,
          cancelMembershipIndexing,
          startIndexRetention,
          startDocumentRetention,
        ),
      inject: [
        PersistenceTransactionContract,
        ValidateKnowledgeBasePruningUseCaseContract,
        LockDocumentRetentionParentsUseCaseContract,
        MembershipRepository,
        CancelMembershipIndexingListener,
        StartDocumentIndexPruningRetentionUseCaseContract,
        StartDocumentPruningRetentionUseCaseContract,
      ],
    },
  ],
  exports: [PruneKnowledgeBaseMembershipsUseCase],
})
export class MembershipPruningModule {}
