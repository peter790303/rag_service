import { Module } from '@nestjs/common'

import { knowledgeBaseDocumentsProviders } from './knowledge-base-documents.providers.ts'
import { PersistenceModule } from './persistence.module.ts'
import { ActivateKnowledgeBaseDocumentIndexCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/activate-knowledge-base-document-index.command.handler.contract.ts'
import { CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/complete-knowledge-base-document-indexing.command.handler.contract.ts'
import { GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/get-knowledge-base-document-indexing-state.query.handler.contract.ts'
import { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'
import { LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/load-retrieval-knowledge-base-documents.query.handler.contract.ts'
import { PrepareKnowledgeBaseDocumentForIndexRequestCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/prepare-knowledge-base-document-for-index-request.command.handler.contract.ts'
import { ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/reserve-knowledge-base-document-for-indexing.command.handler.contract.ts'
import { SaveKnowledgeBaseDocumentIndexRequestCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/save-knowledge-base-document-index-request.command.handler.contract.ts'
import { KnowledgeBaseDocumentRepository as KnowledgeBaseDocumentRepositoryContract } from '../../../KnowledgeBaseDocuments/Application/Ports/Out/Repositories/knowledge-base-document.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: knowledgeBaseDocumentsProviders,
  exports: [
    ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
    ActivateKnowledgeBaseDocumentIndexCommandHandlerContract,
    CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract,
    GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract,
    PrepareKnowledgeBaseDocumentForIndexRequestCommandHandlerContract,
    SaveKnowledgeBaseDocumentIndexRequestCommandHandlerContract,
    InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
    KnowledgeBaseDocumentRepositoryContract,
    LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract,
  ],
})
export class KnowledgeBaseDocumentsModule {}
