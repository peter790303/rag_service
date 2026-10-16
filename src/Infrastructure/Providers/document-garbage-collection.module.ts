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
import { type KnowledgeServiceConfig, KNOWLEDGE_SERVICE_CONFIG } from '../../../config/knowledge-service.config.ts'
import { CollectDocumentIndexGarbageUseCaseContract } from '../../Application/DocumentIndexes/Contracts/collect-document-index-garbage.use-case.contract.ts'
import { PlanDocumentIndexGarbageUseCaseContract } from '../../Application/DocumentIndexes/Contracts/plan-document-index-garbage.use-case.contract.ts'
import { PlanDocumentRelationGarbageUseCaseContract } from '../../Application/DocumentRelations/Contracts/plan-document-relation-garbage.use-case.contract.ts'
import { CollectDocumentRevisionGarbageUseCaseContract } from '../../Application/DocumentRevisions/Contracts/collect-document-revision-garbage.use-case.contract.ts'
import { PlanDocumentRevisionGarbageUseCaseContract } from '../../Application/DocumentRevisions/Contracts/plan-document-revision-garbage.use-case.contract.ts'
import { DocumentRepository as DocumentRepositoryContract } from '../../Application/Documents/Contracts/document.repository.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../Application/Documents/Listeners/document-garbage-collection-requested.listener.ts'
import { InspectDocumentRetentionUseCase } from '../../Application/Documents/UseCases/inspect-document-retention.use-case.ts'
import { LockDocumentRetentionParentsUseCase } from '../../Application/Documents/UseCases/lock-document-retention-parents.use-case.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../Application/KnowledgeBases/Contracts/persistence-transaction.ts'

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
        planIndexGarbage: PlanDocumentIndexGarbageUseCaseContract,
        collectIndexGarbage: CollectDocumentIndexGarbageUseCaseContract,
        planRevisionGarbage: PlanDocumentRevisionGarbageUseCaseContract,
        collectRevisionGarbage: CollectDocumentRevisionGarbageUseCaseContract,
        planRelationGarbage: PlanDocumentRelationGarbageUseCaseContract,
        lockDocumentParents: LockDocumentRetentionParentsUseCase,
        documentRetention: InspectDocumentRetentionUseCase,
        serviceConfig: Pick<KnowledgeServiceConfig, 'gcRetentionMs'>,
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
        ),
      inject: [
        PersistenceTransactionContract,
        DocumentRepositoryContract,
        PlanDocumentIndexGarbageUseCaseContract,
        CollectDocumentIndexGarbageUseCaseContract,
        PlanDocumentRevisionGarbageUseCaseContract,
        CollectDocumentRevisionGarbageUseCaseContract,
        PlanDocumentRelationGarbageUseCaseContract,
        LockDocumentRetentionParentsUseCase,
        InspectDocumentRetentionUseCase,
        KNOWLEDGE_SERVICE_CONFIG,
      ],
    },
  ],
  exports: [DocumentGarbageCollectionRequestedListener],
})
export class DocumentGarbageCollectionModule {}
