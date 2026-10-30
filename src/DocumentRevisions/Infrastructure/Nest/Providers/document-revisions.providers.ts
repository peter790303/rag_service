import { PrepareDocumentRevisionForIndexRequestCommandHandler } from '../../../Application/Commands/prepare-document-revision-for-index-request.command.handler.ts'
import { GetDocumentRevisionForIndexRetryQueryHandlerContract } from '../../../Application/Contracts/get-document-revision-for-index-retry.query.handler.contract.ts'
import { InspectDocumentRevisionRetentionQueryHandlerContract } from '../../../Application/Contracts/inspect-document-revision-retention.query.handler.contract.ts'
import { LoadDocumentRevisionQueryHandlerContract } from '../../../Application/Contracts/load-document-revision.query.handler.contract.ts'
import { LoadRetrievalDocumentRevisionsQueryHandlerContract } from '../../../Application/Contracts/load-retrieval-document-revisions.query.handler.contract.ts'
import { PlanDocumentRevisionGarbageQueryHandlerContract } from '../../../Application/Contracts/plan-document-revision-garbage.query.handler.contract.ts'
import { PrepareDocumentRevisionForIndexRequestCommandHandlerContract } from '../../../Application/Contracts/prepare-document-revision-for-index-request.command.handler.contract.ts'
import { DocumentRevisionRepository as DocumentRevisionRepositoryContract } from '../../../Application/Ports/Out/Repositories/document-revision.repository.ts'
import { GetDocumentRevisionForIndexRetryQueryHandler } from '../../../Application/Queries/get-document-revision-for-index-retry.query.handler.ts'
import { InspectDocumentRevisionRetentionQueryHandler } from '../../../Application/Queries/inspect-document-revision-retention.query.handler.ts'
import { LoadDocumentRevisionQueryHandler } from '../../../Application/Queries/load-document-revision.query.handler.ts'
import { LoadRetrievalDocumentRevisionsQueryHandler } from '../../../Application/Queries/load-retrieval-document-revisions.query.handler.ts'
import { PlanDocumentRevisionGarbageQueryHandler } from '../../../Application/Queries/plan-document-revision-garbage.query.handler.ts'
import { DocumentRevisionRepository } from '../../Persistence/TypeORM/Repositories/document-revision.repository.ts'

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
