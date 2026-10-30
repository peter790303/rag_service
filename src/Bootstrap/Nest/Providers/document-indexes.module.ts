import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { InspectDocumentIndexRetentionQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/inspect-document-index-retention.query.handler.contract.ts'
import { LoadRetrievalDocumentIndexesQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-retrieval-document-indexes.query.handler.contract.ts'
import { PlanDocumentIndexGarbageQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/plan-document-index-garbage.query.handler.contract.ts'
import { CancelKnowledgeBaseDocumentDocumentIndexingListener } from '../../../DocumentIndexes/Application/Listeners/cancel-knowledge-base-document-document-indexing.listener.ts'
import { DocumentIndexExecutionQueue } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-failure.archive.ts'
import { DocumentIndexSuccessArchive } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-success.archive.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../../DocumentIndexes/Application/Ports/Out/Repositories/document-index.repository.ts'
import { documentIndexesProviders } from '../../../DocumentIndexes/Infrastructure/Nest/Providers/document-indexes.providers.ts'

@Module({
  imports: [PersistenceModule],
  providers: documentIndexesProviders,
  exports: [
    DocumentIndexRepositoryContract,
    DocumentIndexExecutionQueue,
    DocumentIndexFailureArchive,
    DocumentIndexSuccessArchive,
    CancelKnowledgeBaseDocumentDocumentIndexingListener,
    InspectDocumentIndexRetentionQueryHandlerContract,
    PlanDocumentIndexGarbageQueryHandlerContract,
    LoadRetrievalDocumentIndexesQueryHandlerContract,
  ],
})
export class DocumentIndexesModule {}
