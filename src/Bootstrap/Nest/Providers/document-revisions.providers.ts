import { PrepareDocumentRevisionForIndexRequestCommandHandler } from '../../../DocumentRevisions/Application/Commands/prepare-document-revision-for-index-request.command.handler.ts'
import { GetDocumentRevisionForIndexRetryQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/get-document-revision-for-index-retry.query.handler.contract.ts'
import { InspectDocumentRevisionRetentionQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/inspect-document-revision-retention.query.handler.contract.ts'
import { LoadDocumentRevisionQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/load-document-revision.query.handler.contract.ts'
import { LoadRetrievalDocumentRevisionsQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/load-retrieval-document-revisions.query.handler.contract.ts'
import { PlanDocumentRevisionGarbageQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/plan-document-revision-garbage.query.handler.contract.ts'
import { PrepareDocumentRevisionForIndexRequestCommandHandlerContract } from '../../../DocumentRevisions/Application/Contracts/prepare-document-revision-for-index-request.command.handler.contract.ts'
import { DocumentRevisionRepository as DocumentRevisionRepositoryContract } from '../../../DocumentRevisions/Application/Ports/Out/Repositories/document-revision.repository.ts'
import { GetDocumentRevisionForIndexRetryQueryHandler } from '../../../DocumentRevisions/Application/Queries/get-document-revision-for-index-retry.query.handler.ts'
import { InspectDocumentRevisionRetentionQueryHandler } from '../../../DocumentRevisions/Application/Queries/inspect-document-revision-retention.query.handler.ts'
import { LoadDocumentRevisionQueryHandler } from '../../../DocumentRevisions/Application/Queries/load-document-revision.query.handler.ts'
import { LoadRetrievalDocumentRevisionsQueryHandler } from '../../../DocumentRevisions/Application/Queries/load-retrieval-document-revisions.query.handler.ts'
import { PlanDocumentRevisionGarbageQueryHandler } from '../../../DocumentRevisions/Application/Queries/plan-document-revision-garbage.query.handler.ts'
import { DocumentRevisionRepository } from '../../../DocumentRevisions/Infrastructure/Persistence/TypeORM/Repositories/document-revision.repository.ts'

export const documentRevisionsProviders = [
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
]
