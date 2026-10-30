import { Module } from '@nestjs/common'

import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { CollectDocumentIndexFailureGarbageCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/collect-document-index-failure-garbage.command.handler.contract.ts'
import { CollectDocumentIndexGarbageCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/collect-document-index-garbage.command.handler.contract.ts'
import { InspectDocumentIndexExecutionRetentionQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/inspect-document-index-execution-retention.query.handler.contract.ts'
import { StartDocumentIndexPruningRetentionCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/start-document-index-pruning-retention.command.handler.contract.ts'
import { documentIndexRetentionProviders } from '../../../DocumentIndexes/Infrastructure/Nest/Providers/document-index-retention.providers.ts'

@Module({
  imports: [DocumentIndexesModule, KnowledgeBaseDocumentsModule, DocumentRelationsModule, ChunksModule],
  providers: documentIndexRetentionProviders,
  exports: [
    CollectDocumentIndexGarbageCommandHandlerContract,
    CollectDocumentIndexFailureGarbageCommandHandlerContract,
    InspectDocumentIndexExecutionRetentionQueryHandlerContract,
    StartDocumentIndexPruningRetentionCommandHandlerContract,
  ],
})
export class DocumentIndexRetentionModule {}
