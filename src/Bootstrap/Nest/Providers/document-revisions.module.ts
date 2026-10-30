import { Module } from '@nestjs/common'

import { documentRevisionsProviders } from './document-revisions.providers.ts'
import { PersistenceModule } from './persistence.module.ts'
import { GetDocumentRevisionForIndexRetryQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/get-document-revision-for-index-retry.query.handler.contract.ts'
import { InspectDocumentRevisionRetentionQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/inspect-document-revision-retention.query.handler.contract.ts'
import { LoadDocumentRevisionQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/load-document-revision.query.handler.contract.ts'
import { LoadRetrievalDocumentRevisionsQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/load-retrieval-document-revisions.query.handler.contract.ts'
import { PlanDocumentRevisionGarbageQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/plan-document-revision-garbage.query.handler.contract.ts'
import { PrepareDocumentRevisionForIndexRequestCommandHandlerContract } from '../../../DocumentRevisions/Application/Contracts/prepare-document-revision-for-index-request.command.handler.contract.ts'
import { DocumentRevisionRepository as DocumentRevisionRepositoryContract } from '../../../DocumentRevisions/Application/Ports/Out/Repositories/document-revision.repository.ts'
import { LoadDocumentRevisionQueryHandler } from '../../../DocumentRevisions/Application/Queries/load-document-revision.query.handler.ts'

@Module({
  imports: [PersistenceModule],
  providers: documentRevisionsProviders,
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
