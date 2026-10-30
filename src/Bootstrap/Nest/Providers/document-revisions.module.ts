import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { PrepareDocumentRevisionForIndexRequestCommandHandler } from '../../../Documents/Application/Commands/prepare-document-revision-for-index-request.command.handler.ts'
import { GetDocumentRevisionForIndexRetryQueryHandlerContract } from '../../../Documents/Application/Contracts/get-document-revision-for-index-retry.query.handler.contract.ts'
import { InspectDocumentRevisionRetentionQueryHandlerContract } from '../../../Documents/Application/Contracts/inspect-document-revision-retention.query.handler.contract.ts'
import { LoadDocumentRevisionQueryHandlerContract } from '../../../Documents/Application/Contracts/load-document-revision.query.handler.contract.ts'
import { LoadRetrievalDocumentRevisionsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-document-revisions.query.handler.contract.ts'
import { PlanDocumentRevisionGarbageQueryHandlerContract } from '../../../Documents/Application/Contracts/plan-document-revision-garbage.query.handler.contract.ts'
import { PrepareDocumentRevisionForIndexRequestCommandHandlerContract } from '../../../Documents/Application/Contracts/prepare-document-revision-for-index-request.command.handler.contract.ts'
import { DocumentRevisionRepository as DocumentRevisionRepositoryContract } from '../../../Documents/Application/Ports/Out/Repositories/document-revision.repository.ts'
import { GetDocumentRevisionForIndexRetryQueryHandler } from '../../../Documents/Application/Queries/get-document-revision-for-index-retry.query.handler.ts'
import { InspectDocumentRevisionRetentionQueryHandler } from '../../../Documents/Application/Queries/inspect-document-revision-retention.query.handler.ts'
import { LoadDocumentRevisionQueryHandler } from '../../../Documents/Application/Queries/load-document-revision.query.handler.ts'
import { LoadRetrievalDocumentRevisionsQueryHandler } from '../../../Documents/Application/Queries/load-retrieval-document-revisions.query.handler.ts'
import { PlanDocumentRevisionGarbageQueryHandler } from '../../../Documents/Application/Queries/plan-document-revision-garbage.query.handler.ts'
import { DocumentRevisionRepository } from '../../../Documents/Infrastructure/Persistence/TypeORM/Repositories/document-revision.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
    DocumentRevisionRepository,
    {
      provide: LoadDocumentRevisionQueryHandler,
      useFactory: (documentRevisionRepository: DocumentRevisionRepositoryContract) =>
        new LoadDocumentRevisionQueryHandler(documentRevisionRepository),
      inject: [DocumentRevisionRepositoryContract],
    },
    {
      provide: GetDocumentRevisionForIndexRetryQueryHandler,
      useFactory: (revisions: DocumentRevisionRepositoryContract) =>
        new GetDocumentRevisionForIndexRetryQueryHandler(revisions),
      inject: [DocumentRevisionRepositoryContract],
    },
    {
      provide: InspectDocumentRevisionRetentionQueryHandler,
      useFactory: (documentRevisionRepository: DocumentRevisionRepositoryContract) =>
        new InspectDocumentRevisionRetentionQueryHandler(documentRevisionRepository),
      inject: [DocumentRevisionRepositoryContract],
    },
    {
      provide: LoadRetrievalDocumentRevisionsQueryHandler,
      useFactory: (repository: DocumentRevisionRepositoryContract) =>
        new LoadRetrievalDocumentRevisionsQueryHandler(repository),
      inject: [DocumentRevisionRepositoryContract],
    },
    {
      provide: PlanDocumentRevisionGarbageQueryHandler,
      useFactory: (documentRevisionRepository: DocumentRevisionRepositoryContract) =>
        new PlanDocumentRevisionGarbageQueryHandler(documentRevisionRepository),
      inject: [DocumentRevisionRepositoryContract],
    },
    {
      provide: PrepareDocumentRevisionForIndexRequestCommandHandler,
      useFactory: (revisions: DocumentRevisionRepositoryContract) =>
        new PrepareDocumentRevisionForIndexRequestCommandHandler(revisions),
      inject: [DocumentRevisionRepositoryContract],
    },
    {
      provide: GetDocumentRevisionForIndexRetryQueryHandlerContract,
      useExisting: GetDocumentRevisionForIndexRetryQueryHandler,
    },
    {
      provide: InspectDocumentRevisionRetentionQueryHandlerContract,
      useExisting: InspectDocumentRevisionRetentionQueryHandler,
    },
    { provide: LoadDocumentRevisionQueryHandlerContract, useExisting: LoadDocumentRevisionQueryHandler },
    {
      provide: LoadRetrievalDocumentRevisionsQueryHandlerContract,
      useExisting: LoadRetrievalDocumentRevisionsQueryHandler,
    },
    { provide: PlanDocumentRevisionGarbageQueryHandlerContract, useExisting: PlanDocumentRevisionGarbageQueryHandler },
    {
      provide: PrepareDocumentRevisionForIndexRequestCommandHandlerContract,
      useExisting: PrepareDocumentRevisionForIndexRequestCommandHandler,
    },
    { provide: DocumentRevisionRepositoryContract, useExisting: DocumentRevisionRepository },
  ],
  exports: [
    LoadDocumentRevisionQueryHandler,
    LoadDocumentRevisionQueryHandlerContract,
    PrepareDocumentRevisionForIndexRequestCommandHandlerContract,
    GetDocumentRevisionForIndexRetryQueryHandlerContract,
    DocumentRevisionRepositoryContract,
    InspectDocumentRevisionRetentionQueryHandlerContract,
    PlanDocumentRevisionGarbageQueryHandlerContract,
    LoadRetrievalDocumentRevisionsQueryHandlerContract,
  ],
})
export class DocumentRevisionsModule {}
