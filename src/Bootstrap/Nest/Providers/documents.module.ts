import { Module } from '@nestjs/common'

import { documentsProviders } from './documents.providers.ts'
import { PersistenceModule } from './persistence.module.ts'
import { LockDocumentRetentionParentsCommandHandler } from '../../../Documents/Application/Commands/lock-document-retention-parents.command.handler.ts'
import { GetDocumentForIndexRetryQueryHandlerContract } from '../../../Documents/Application/Contracts/get-document-for-index-retry.query.handler.contract.ts'
import { LoadRetrievalDocumentsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-documents.query.handler.contract.ts'
import { LockDocumentRetentionParentsCommandHandlerContract } from '../../../Documents/Application/Contracts/lock-document-retention-parents.command.handler.contract.ts'
import { PrepareDocumentForIndexRequestCommandHandlerContract } from '../../../Documents/Application/Contracts/prepare-document-for-index-request.command.handler.contract.ts'
import { ReserveDocumentForIndexingCommandHandlerContract } from '../../../Documents/Application/Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import { DocumentRepository as DocumentRepositoryContract } from '../../../Documents/Application/Ports/Out/Repositories/document.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: documentsProviders,
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
