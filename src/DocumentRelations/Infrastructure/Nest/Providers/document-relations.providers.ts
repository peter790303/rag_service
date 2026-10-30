import { CollectDocumentRelationGarbageCommandHandler } from '../../../Application/Commands/collect-document-relation-garbage.command.handler.ts'
import { ReplacePlannedDocumentRelationsCommandHandler } from '../../../Application/Commands/replace-planned-document-relations.command.handler.ts'
import { CollectDocumentRelationGarbageCommandHandlerContract } from '../../../Application/Contracts/collect-document-relation-garbage.command.handler.contract.ts'
import { InspectDocumentRelationRetentionQueryHandlerContract } from '../../../Application/Contracts/inspect-document-relation-retention.query.handler.contract.ts'
import { LoadRetrievalDocumentRelationsQueryHandlerContract } from '../../../Application/Contracts/load-retrieval-document-relations.query.handler.contract.ts'
import { PlanDocumentRelationGarbageQueryHandlerContract } from '../../../Application/Contracts/plan-document-relation-garbage.query.handler.contract.ts'
import { ReplacePlannedDocumentRelationsCommandHandlerContract } from '../../../Application/Contracts/replace-planned-document-relations.command.handler.contract.ts'
import { DocumentRelationRepository as DocumentRelationRepositoryContract } from '../../../Application/Ports/Out/Repositories/document-relation.repository.ts'
import { InspectDocumentRelationRetentionQueryHandler } from '../../../Application/Queries/inspect-document-relation-retention.query.handler.ts'
import { LoadRetrievalDocumentRelationsQueryHandler } from '../../../Application/Queries/load-retrieval-document-relations.query.handler.ts'
import { PlanDocumentRelationGarbageQueryHandler } from '../../../Application/Queries/plan-document-relation-garbage.query.handler.ts'
import { DocumentRelationRepository } from '../../Persistence/TypeORM/Repositories/document-relation.repository.ts'

export const documentRelationsProviders = [
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
]
