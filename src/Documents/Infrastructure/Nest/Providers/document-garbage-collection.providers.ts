import {
  type KnowledgeServiceConfig,
  KNOWLEDGE_SERVICE_CONFIG,
} from '../../../../../config/knowledge-service.config.ts'
import { CollectDocumentIndexFailureGarbageCommandHandlerContract } from '../../../../DocumentIndexes/Application/Contracts/collect-document-index-failure-garbage.command.handler.contract.ts'
import { CollectDocumentIndexGarbageCommandHandlerContract } from '../../../../DocumentIndexes/Application/Contracts/collect-document-index-garbage.command.handler.contract.ts'
import { PlanDocumentIndexGarbageQueryHandlerContract } from '../../../../DocumentIndexes/Application/Contracts/plan-document-index-garbage.query.handler.contract.ts'
import { PlanDocumentRelationGarbageQueryHandlerContract } from '../../../../DocumentRelations/Application/Contracts/plan-document-relation-garbage.query.handler.contract.ts'
import { CollectDocumentRevisionGarbageCommandHandlerContract } from '../../../../DocumentRevisions/Application/Contracts/collect-document-revision-garbage.command.handler.contract.ts'
import { PlanDocumentRevisionGarbageQueryHandlerContract } from '../../../../DocumentRevisions/Application/Contracts/plan-document-revision-garbage.query.handler.contract.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import { LockDocumentRetentionParentsCommandHandler } from '../../../Application/Commands/lock-document-retention-parents.command.handler.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../Application/Listeners/document-garbage-collection-requested.listener.ts'
import { DocumentRepository as DocumentRepositoryContract } from '../../../Application/Ports/Out/Repositories/document.repository.ts'
import { InspectDocumentRetentionQueryHandler } from '../../../Application/Queries/inspect-document-retention.query.handler.ts'

export const documentGarbageCollectionProviders = [
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
      collectFailureGarbage: CollectDocumentIndexFailureGarbageCommandHandlerContract,
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
        collectFailureGarbage,
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
      CollectDocumentIndexFailureGarbageCommandHandlerContract,
    ],
  },
]
