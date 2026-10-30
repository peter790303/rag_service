import { LockDocumentRetentionParentsCommandHandler } from '../../../Application/Commands/lock-document-retention-parents.command.handler.ts'
import { PrepareDocumentForIndexRequestCommandHandler } from '../../../Application/Commands/prepare-document-for-index-request.command.handler.ts'
import { ReserveDocumentForIndexingCommandHandler } from '../../../Application/Commands/reserve-document-for-indexing.command.handler.ts'
import { GetDocumentForIndexRetryQueryHandlerContract } from '../../../Application/Contracts/get-document-for-index-retry.query.handler.contract.ts'
import { LoadRetrievalDocumentsQueryHandlerContract } from '../../../Application/Contracts/load-retrieval-documents.query.handler.contract.ts'
import { LockDocumentRetentionParentsCommandHandlerContract } from '../../../Application/Contracts/lock-document-retention-parents.command.handler.contract.ts'
import { PrepareDocumentForIndexRequestCommandHandlerContract } from '../../../Application/Contracts/prepare-document-for-index-request.command.handler.contract.ts'
import { ReserveDocumentForIndexingCommandHandlerContract } from '../../../Application/Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import { DocumentRepository as DocumentRepositoryContract } from '../../../Application/Ports/Out/Repositories/document.repository.ts'
import { GetDocumentForIndexRetryQueryHandler } from '../../../Application/Queries/get-document-for-index-retry.query.handler.ts'
import { LoadRetrievalDocumentsQueryHandler } from '../../../Application/Queries/load-retrieval-documents.query.handler.ts'
import { DocumentRepository } from '../../Persistence/TypeORM/Repositories/document.repository.ts'

export const documentsProviders = [
  DocumentRepository,
  {
    provide: GetDocumentForIndexRetryQueryHandler,
    useFactory: (documents: DocumentRepositoryContract) => new GetDocumentForIndexRetryQueryHandler(documents),
    inject: [DocumentRepositoryContract],
  },
  {
    provide: LoadRetrievalDocumentsQueryHandler,
    useFactory: (repository: DocumentRepositoryContract) => new LoadRetrievalDocumentsQueryHandler(repository),
    inject: [DocumentRepositoryContract],
  },
  {
    provide: LockDocumentRetentionParentsCommandHandler,
    useFactory: (documentRepository: DocumentRepositoryContract) =>
      new LockDocumentRetentionParentsCommandHandler(documentRepository),
    inject: [DocumentRepositoryContract],
  },
  {
    provide: PrepareDocumentForIndexRequestCommandHandler,
    useFactory: (documents: DocumentRepositoryContract) => new PrepareDocumentForIndexRequestCommandHandler(documents),
    inject: [DocumentRepositoryContract],
  },
  {
    provide: ReserveDocumentForIndexingCommandHandler,
    useFactory: (documents: DocumentRepositoryContract) => new ReserveDocumentForIndexingCommandHandler(documents),
    inject: [DocumentRepositoryContract],
  },
  { provide: GetDocumentForIndexRetryQueryHandlerContract, useExisting: GetDocumentForIndexRetryQueryHandler },
  { provide: LoadRetrievalDocumentsQueryHandlerContract, useExisting: LoadRetrievalDocumentsQueryHandler },
  {
    provide: LockDocumentRetentionParentsCommandHandlerContract,
    useExisting: LockDocumentRetentionParentsCommandHandler,
  },
  {
    provide: PrepareDocumentForIndexRequestCommandHandlerContract,
    useExisting: PrepareDocumentForIndexRequestCommandHandler,
  },
  {
    provide: ReserveDocumentForIndexingCommandHandlerContract,
    useExisting: ReserveDocumentForIndexingCommandHandler,
  },
  { provide: DocumentRepositoryContract, useExisting: DocumentRepository },
]
