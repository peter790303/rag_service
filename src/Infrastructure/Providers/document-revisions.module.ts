import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { DocumentRevisionRepository as DocumentRevisionRepositoryContract } from '../../Application/DocumentRevisions/Contracts/document-revision.repository.ts'
import { GetDocumentRevisionForIndexRetryUseCaseContract } from '../../Application/DocumentRevisions/Contracts/get-document-revision-for-index-retry.use-case.contract.ts'
import { InspectDocumentRevisionRetentionUseCaseContract } from '../../Application/DocumentRevisions/Contracts/inspect-document-revision-retention.use-case.contract.ts'
import { LoadDocumentRevisionUseCaseContract } from '../../Application/DocumentRevisions/Contracts/load-document-revision.use-case.contract.ts'
import { LoadRetrievalDocumentRevisionsUseCaseContract } from '../../Application/DocumentRevisions/Contracts/load-retrieval-document-revisions.use-case.contract.ts'
import { PlanDocumentRevisionGarbageUseCaseContract } from '../../Application/DocumentRevisions/Contracts/plan-document-revision-garbage.use-case.contract.ts'
import { PrepareDocumentRevisionForIndexRequestUseCaseContract } from '../../Application/DocumentRevisions/Contracts/prepare-document-revision-for-index-request.use-case.contract.ts'
import { GetDocumentRevisionForIndexRetryUseCase } from '../../Application/DocumentRevisions/UseCases/get-document-revision-for-index-retry.use-case.ts'
import { InspectDocumentRevisionRetentionUseCase } from '../../Application/DocumentRevisions/UseCases/inspect-document-revision-retention.use-case.ts'
import { LoadDocumentRevisionUseCase } from '../../Application/DocumentRevisions/UseCases/load-document-revision.use-case.ts'
import { LoadRetrievalDocumentRevisionsUseCase } from '../../Application/DocumentRevisions/UseCases/load-retrieval-document-revisions.use-case.ts'
import { PlanDocumentRevisionGarbageUseCase } from '../../Application/DocumentRevisions/UseCases/plan-document-revision-garbage.use-case.ts'
import { PrepareDocumentRevisionForIndexRequestUseCase } from '../../Application/DocumentRevisions/UseCases/prepare-document-revision-for-index-request.use-case.ts'
import { DocumentRevisionRepository } from '../Persistence/Repositories/document-revision.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
    DocumentRevisionRepository,
    {
      provide: LoadDocumentRevisionUseCase,
      useFactory: (documentRevisionRepository: DocumentRevisionRepositoryContract) =>
        new LoadDocumentRevisionUseCase(documentRevisionRepository),
      inject: [DocumentRevisionRepositoryContract],
    },
    {
      provide: GetDocumentRevisionForIndexRetryUseCase,
      useFactory: (revisions: DocumentRevisionRepositoryContract) =>
        new GetDocumentRevisionForIndexRetryUseCase(revisions),
      inject: [DocumentRevisionRepositoryContract],
    },
    {
      provide: InspectDocumentRevisionRetentionUseCase,
      useFactory: (documentRevisionRepository: DocumentRevisionRepositoryContract) =>
        new InspectDocumentRevisionRetentionUseCase(documentRevisionRepository),
      inject: [DocumentRevisionRepositoryContract],
    },
    {
      provide: LoadRetrievalDocumentRevisionsUseCase,
      useFactory: (repository: DocumentRevisionRepositoryContract) =>
        new LoadRetrievalDocumentRevisionsUseCase(repository),
      inject: [DocumentRevisionRepositoryContract],
    },
    {
      provide: PlanDocumentRevisionGarbageUseCase,
      useFactory: (documentRevisionRepository: DocumentRevisionRepositoryContract) =>
        new PlanDocumentRevisionGarbageUseCase(documentRevisionRepository),
      inject: [DocumentRevisionRepositoryContract],
    },
    {
      provide: PrepareDocumentRevisionForIndexRequestUseCase,
      useFactory: (revisions: DocumentRevisionRepositoryContract) =>
        new PrepareDocumentRevisionForIndexRequestUseCase(revisions),
      inject: [DocumentRevisionRepositoryContract],
    },
    { provide: GetDocumentRevisionForIndexRetryUseCaseContract, useExisting: GetDocumentRevisionForIndexRetryUseCase },
    { provide: InspectDocumentRevisionRetentionUseCaseContract, useExisting: InspectDocumentRevisionRetentionUseCase },
    { provide: LoadDocumentRevisionUseCaseContract, useExisting: LoadDocumentRevisionUseCase },
    { provide: LoadRetrievalDocumentRevisionsUseCaseContract, useExisting: LoadRetrievalDocumentRevisionsUseCase },
    { provide: PlanDocumentRevisionGarbageUseCaseContract, useExisting: PlanDocumentRevisionGarbageUseCase },
    {
      provide: PrepareDocumentRevisionForIndexRequestUseCaseContract,
      useExisting: PrepareDocumentRevisionForIndexRequestUseCase,
    },
    { provide: DocumentRevisionRepositoryContract, useExisting: DocumentRevisionRepository },
  ],
  exports: [
    LoadDocumentRevisionUseCase,
    LoadDocumentRevisionUseCaseContract,
    PrepareDocumentRevisionForIndexRequestUseCaseContract,
    GetDocumentRevisionForIndexRetryUseCaseContract,
    DocumentRevisionRepositoryContract,
    InspectDocumentRevisionRetentionUseCaseContract,
    PlanDocumentRevisionGarbageUseCaseContract,
    LoadRetrievalDocumentRevisionsUseCaseContract,
  ],
})
export class DocumentRevisionsModule {}
