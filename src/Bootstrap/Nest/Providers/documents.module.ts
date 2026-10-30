import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { LockDocumentRetentionParentsCommandHandler } from '../../../Documents/Application/Commands/lock-document-retention-parents.command.handler.ts'
import { PrepareDocumentForIndexRequestCommandHandler } from '../../../Documents/Application/Commands/prepare-document-for-index-request.command.handler.ts'
import { ReserveDocumentForIndexingCommandHandler } from '../../../Documents/Application/Commands/reserve-document-for-indexing.command.handler.ts'
import { GetDocumentForIndexRetryQueryHandlerContract } from '../../../Documents/Application/Contracts/get-document-for-index-retry.query.handler.contract.ts'
import { LoadRetrievalDocumentsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-documents.query.handler.contract.ts'
import { LockDocumentRetentionParentsCommandHandlerContract } from '../../../Documents/Application/Contracts/lock-document-retention-parents.command.handler.contract.ts'
import { PrepareDocumentForIndexRequestCommandHandlerContract } from '../../../Documents/Application/Contracts/prepare-document-for-index-request.command.handler.contract.ts'
import { ReserveDocumentForIndexingCommandHandlerContract } from '../../../Documents/Application/Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import { DocumentRepository as DocumentRepositoryContract } from '../../../Documents/Application/Ports/Out/Repositories/document.repository.ts'
import { GetDocumentForIndexRetryQueryHandler } from '../../../Documents/Application/Queries/get-document-for-index-retry.query.handler.ts'
import { LoadRetrievalDocumentsQueryHandler } from '../../../Documents/Application/Queries/load-retrieval-documents.query.handler.ts'
import { DocumentRepository } from '../../../Documents/Infrastructure/Persistence/TypeORM/Repositories/document.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
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
      useFactory: (documents: DocumentRepositoryContract) =>
        new PrepareDocumentForIndexRequestCommandHandler(documents),
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
  ],
  exports: [
    ReserveDocumentForIndexingCommandHandlerContract,
    PrepareDocumentForIndexRequestCommandHandlerContract,
    GetDocumentForIndexRetryQueryHandlerContract,
    DocumentRepositoryContract,
    LockDocumentRetentionParentsCommandHandler,
    LockDocumentRetentionParentsCommandHandlerContract,
    LoadRetrievalDocumentsQueryHandlerContract,
  ],
})
export class DocumentsModule {}
