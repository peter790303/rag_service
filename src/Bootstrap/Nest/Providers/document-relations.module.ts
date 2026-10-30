import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { CollectDocumentRelationGarbageCommandHandler } from '../../../Documents/Application/Commands/collect-document-relation-garbage.command.handler.ts'
import { ReplacePlannedDocumentRelationsCommandHandler } from '../../../Documents/Application/Commands/replace-planned-document-relations.command.handler.ts'
import { CollectDocumentRelationGarbageCommandHandlerContract } from '../../../Documents/Application/Contracts/collect-document-relation-garbage.command.handler.contract.ts'
import { InspectDocumentRelationRetentionQueryHandlerContract } from '../../../Documents/Application/Contracts/inspect-document-relation-retention.query.handler.contract.ts'
import { LoadRetrievalDocumentRelationsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-document-relations.query.handler.contract.ts'
import { PlanDocumentRelationGarbageQueryHandlerContract } from '../../../Documents/Application/Contracts/plan-document-relation-garbage.query.handler.contract.ts'
import { ReplacePlannedDocumentRelationsCommandHandlerContract } from '../../../Documents/Application/Contracts/replace-planned-document-relations.command.handler.contract.ts'
import { DocumentRelationRepository as DocumentRelationRepositoryContract } from '../../../Documents/Application/Ports/Out/Repositories/document-relation.repository.ts'
import { InspectDocumentRelationRetentionQueryHandler } from '../../../Documents/Application/Queries/inspect-document-relation-retention.query.handler.ts'
import { LoadRetrievalDocumentRelationsQueryHandler } from '../../../Documents/Application/Queries/load-retrieval-document-relations.query.handler.ts'
import { PlanDocumentRelationGarbageQueryHandler } from '../../../Documents/Application/Queries/plan-document-relation-garbage.query.handler.ts'
import { DocumentRelationRepository } from '../../../Documents/Infrastructure/Persistence/TypeORM/Repositories/document-relation.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
    DocumentRelationRepository,
    {
      provide: CollectDocumentRelationGarbageCommandHandler,
      useFactory: (documentRelationRepository: DocumentRelationRepositoryContract) =>
        new CollectDocumentRelationGarbageCommandHandler(documentRelationRepository),
      inject: [DocumentRelationRepositoryContract],
    },
    {
      provide: InspectDocumentRelationRetentionQueryHandler,
      useFactory: (documentRelationRepository: DocumentRelationRepositoryContract) =>
        new InspectDocumentRelationRetentionQueryHandler(documentRelationRepository),
      inject: [DocumentRelationRepositoryContract],
    },
    {
      provide: LoadRetrievalDocumentRelationsQueryHandler,
      useFactory: (repository: DocumentRelationRepositoryContract) =>
        new LoadRetrievalDocumentRelationsQueryHandler(repository),
      inject: [DocumentRelationRepositoryContract],
    },
    {
      provide: PlanDocumentRelationGarbageQueryHandler,
      useFactory: (documentRelationRepository: DocumentRelationRepositoryContract) =>
        new PlanDocumentRelationGarbageQueryHandler(documentRelationRepository),
      inject: [DocumentRelationRepositoryContract],
    },
    {
      provide: ReplacePlannedDocumentRelationsCommandHandler,
      useFactory: (documentRelationRepository: DocumentRelationRepositoryContract) =>
        new ReplacePlannedDocumentRelationsCommandHandler(documentRelationRepository),
      inject: [DocumentRelationRepositoryContract],
    },
    {
      provide: CollectDocumentRelationGarbageCommandHandlerContract,
      useExisting: CollectDocumentRelationGarbageCommandHandler,
    },
    {
      provide: InspectDocumentRelationRetentionQueryHandlerContract,
      useExisting: InspectDocumentRelationRetentionQueryHandler,
    },
    {
      provide: LoadRetrievalDocumentRelationsQueryHandlerContract,
      useExisting: LoadRetrievalDocumentRelationsQueryHandler,
    },
    { provide: PlanDocumentRelationGarbageQueryHandlerContract, useExisting: PlanDocumentRelationGarbageQueryHandler },
    {
      provide: ReplacePlannedDocumentRelationsCommandHandlerContract,
      useExisting: ReplacePlannedDocumentRelationsCommandHandler,
    },
    { provide: DocumentRelationRepositoryContract, useExisting: DocumentRelationRepository },
  ],
  exports: [
    ReplacePlannedDocumentRelationsCommandHandlerContract,
    CollectDocumentRelationGarbageCommandHandlerContract,
    InspectDocumentRelationRetentionQueryHandlerContract,
    PlanDocumentRelationGarbageQueryHandlerContract,
    LoadRetrievalDocumentRelationsQueryHandlerContract,
  ],
})
export class DocumentRelationsModule {}
