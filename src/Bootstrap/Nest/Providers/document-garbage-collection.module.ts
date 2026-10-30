import { Module } from '@nestjs/common'

import { DocumentIndexRetentionModule } from './document-index-retention.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentRetentionModule } from './document-retention.module.ts'
import { DocumentRevisionRetentionModule } from './document-revision-retention.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { type KnowledgeServiceConfig, KNOWLEDGE_SERVICE_CONFIG } from '../../../../config/knowledge-service.config.ts'
import { CollectDocumentIndexGarbageCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/collect-document-index-garbage.command.handler.contract.ts'
import { PlanDocumentIndexGarbageQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/plan-document-index-garbage.query.handler.contract.ts'
import { DocumentIndexExecutionQueue } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-failure.archive.ts'
import { LockDocumentRetentionParentsCommandHandler } from '../../../Documents/Application/Commands/lock-document-retention-parents.command.handler.ts'
import { CollectDocumentRevisionGarbageCommandHandlerContract } from '../../../Documents/Application/Contracts/collect-document-revision-garbage.command.handler.contract.ts'
import { PlanDocumentRelationGarbageQueryHandlerContract } from '../../../Documents/Application/Contracts/plan-document-relation-garbage.query.handler.contract.ts'
import { PlanDocumentRevisionGarbageQueryHandlerContract } from '../../../Documents/Application/Contracts/plan-document-revision-garbage.query.handler.contract.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../Documents/Application/Listeners/document-garbage-collection-requested.listener.ts'
import { DocumentRepository as DocumentRepositoryContract } from '../../../Documents/Application/Ports/Out/Repositories/document.repository.ts'
import { InspectDocumentRetentionQueryHandler } from '../../../Documents/Application/Queries/inspect-document-retention.query.handler.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'

@Module({
  imports: [
    PersistenceModule,
    DocumentsModule,
    DocumentIndexesModule,
    DocumentIndexRetentionModule,
    DocumentRevisionsModule,
    DocumentRevisionRetentionModule,
    DocumentRelationsModule,
    DocumentRetentionModule,
    KnowledgeServiceConfigModule,
  ],
  providers: [
    {
      provide: DocumentGarbageCollectionRequestedListener,
      useFactory: (
        persistenceTransaction: PersistenceTransactionContract,
        documentRepository: DocumentRepositoryContract,
        planIndexGarbage: PlanDocumentIndexGarbageQueryHandlerContract,
        collectIndexGarbage: CollectDocumentIndexGarbageCommandHandlerContract,
        planRevisionGarbage: PlanDocumentRevisionGarbageQueryHandlerContract,
        collectRevisionGarbage: CollectDocumentRevisionGarbageCommandHandlerContract,
        planRelationGarbage: PlanDocumentRelationGarbageQueryHandlerContract,
        lockDocumentParents: LockDocumentRetentionParentsCommandHandler,
        documentRetention: InspectDocumentRetentionQueryHandler,
        serviceConfig: Pick<KnowledgeServiceConfig, 'gcRetentionMs'>,
        documentIndexExecutionQueue: DocumentIndexExecutionQueue,
        documentIndexFailureArchive: DocumentIndexFailureArchive,
      ) =>
        new DocumentGarbageCollectionRequestedListener(
          persistenceTransaction,
          documentRepository,
          planIndexGarbage,
          collectIndexGarbage,
          planRevisionGarbage,
          collectRevisionGarbage,
          planRelationGarbage,
          lockDocumentParents,
          documentRetention,
          serviceConfig,
          documentIndexExecutionQueue,
          documentIndexFailureArchive,
        ),
      inject: [
        PersistenceTransactionContract,
        DocumentRepositoryContract,
        PlanDocumentIndexGarbageQueryHandlerContract,
        CollectDocumentIndexGarbageCommandHandlerContract,
        PlanDocumentRevisionGarbageQueryHandlerContract,
        CollectDocumentRevisionGarbageCommandHandlerContract,
        PlanDocumentRelationGarbageQueryHandlerContract,
        LockDocumentRetentionParentsCommandHandler,
        InspectDocumentRetentionQueryHandler,
        KNOWLEDGE_SERVICE_CONFIG,
        DocumentIndexExecutionQueue,
        DocumentIndexFailureArchive,
      ],
    },
  ],
  exports: [DocumentGarbageCollectionRequestedListener],
})
export class DocumentGarbageCollectionModule {}
