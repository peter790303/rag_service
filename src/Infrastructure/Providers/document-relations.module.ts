import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { CollectDocumentRelationGarbageUseCaseContract } from '../../Application/DocumentRelations/Contracts/collect-document-relation-garbage.use-case.contract.ts'
import { DocumentRelationRepository as DocumentRelationRepositoryContract } from '../../Application/DocumentRelations/Contracts/document-relation.repository.ts'
import { InspectDocumentRelationRetentionUseCaseContract } from '../../Application/DocumentRelations/Contracts/inspect-document-relation-retention.use-case.contract.ts'
import { LoadRetrievalDocumentRelationsUseCaseContract } from '../../Application/DocumentRelations/Contracts/load-retrieval-document-relations.use-case.contract.ts'
import { PlanDocumentRelationGarbageUseCaseContract } from '../../Application/DocumentRelations/Contracts/plan-document-relation-garbage.use-case.contract.ts'
import { ReplacePlannedDocumentRelationsUseCaseContract } from '../../Application/DocumentRelations/Contracts/replace-planned-document-relations.use-case.contract.ts'
import { CollectDocumentRelationGarbageUseCase } from '../../Application/DocumentRelations/UseCases/collect-document-relation-garbage.use-case.ts'
import { InspectDocumentRelationRetentionUseCase } from '../../Application/DocumentRelations/UseCases/inspect-document-relation-retention.use-case.ts'
import { LoadRetrievalDocumentRelationsUseCase } from '../../Application/DocumentRelations/UseCases/load-retrieval-document-relations.use-case.ts'
import { PlanDocumentRelationGarbageUseCase } from '../../Application/DocumentRelations/UseCases/plan-document-relation-garbage.use-case.ts'
import { ReplacePlannedDocumentRelationsUseCase } from '../../Application/DocumentRelations/UseCases/replace-planned-document-relations.use-case.ts'
import { DocumentRelationRepository } from '../Persistence/Repositories/document-relation.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
    DocumentRelationRepository,
    {
      provide: CollectDocumentRelationGarbageUseCase,
      useFactory: (documentRelationRepository: DocumentRelationRepositoryContract) =>
        new CollectDocumentRelationGarbageUseCase(documentRelationRepository),
      inject: [DocumentRelationRepositoryContract],
    },
    {
      provide: InspectDocumentRelationRetentionUseCase,
      useFactory: (documentRelationRepository: DocumentRelationRepositoryContract) =>
        new InspectDocumentRelationRetentionUseCase(documentRelationRepository),
      inject: [DocumentRelationRepositoryContract],
    },
    {
      provide: LoadRetrievalDocumentRelationsUseCase,
      useFactory: (repository: DocumentRelationRepositoryContract) =>
        new LoadRetrievalDocumentRelationsUseCase(repository),
      inject: [DocumentRelationRepositoryContract],
    },
    {
      provide: PlanDocumentRelationGarbageUseCase,
      useFactory: (documentRelationRepository: DocumentRelationRepositoryContract) =>
        new PlanDocumentRelationGarbageUseCase(documentRelationRepository),
      inject: [DocumentRelationRepositoryContract],
    },
    {
      provide: ReplacePlannedDocumentRelationsUseCase,
      useFactory: (documentRelationRepository: DocumentRelationRepositoryContract) =>
        new ReplacePlannedDocumentRelationsUseCase(documentRelationRepository),
      inject: [DocumentRelationRepositoryContract],
    },
    { provide: CollectDocumentRelationGarbageUseCaseContract, useExisting: CollectDocumentRelationGarbageUseCase },
    { provide: InspectDocumentRelationRetentionUseCaseContract, useExisting: InspectDocumentRelationRetentionUseCase },
    { provide: LoadRetrievalDocumentRelationsUseCaseContract, useExisting: LoadRetrievalDocumentRelationsUseCase },
    { provide: PlanDocumentRelationGarbageUseCaseContract, useExisting: PlanDocumentRelationGarbageUseCase },
    { provide: ReplacePlannedDocumentRelationsUseCaseContract, useExisting: ReplacePlannedDocumentRelationsUseCase },
    { provide: DocumentRelationRepositoryContract, useExisting: DocumentRelationRepository },
  ],
  exports: [
    ReplacePlannedDocumentRelationsUseCaseContract,
    CollectDocumentRelationGarbageUseCaseContract,
    InspectDocumentRelationRetentionUseCaseContract,
    PlanDocumentRelationGarbageUseCaseContract,
    LoadRetrievalDocumentRelationsUseCaseContract,
  ],
})
export class DocumentRelationsModule {}
