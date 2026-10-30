import { Module } from '@nestjs/common'

import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { CollectDocumentIndexGarbageCommandHandler } from '../../../DocumentIndexes/Application/Commands/collect-document-index-garbage.command.handler.ts'
import { StartDocumentIndexPruningRetentionCommandHandler } from '../../../DocumentIndexes/Application/Commands/start-document-index-pruning-retention.command.handler.ts'
import { CollectDocumentIndexGarbageCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/collect-document-index-garbage.command.handler.contract.ts'
import { CollectIndexChunkGarbageCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/collect-index-chunk-garbage.command.handler.contract.ts'
import { StartDocumentIndexPruningRetentionCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/start-document-index-pruning-retention.command.handler.contract.ts'
import { DocumentIndexExecutionQueue } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-failure.archive.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../../DocumentIndexes/Application/Ports/Out/Repositories/document-index.repository.ts'
import { CollectDocumentRelationGarbageCommandHandlerContract } from '../../../Documents/Application/Contracts/collect-document-relation-garbage.command.handler.contract.ts'
import { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'

@Module({
  imports: [DocumentIndexesModule, KnowledgeBaseDocumentsModule, DocumentRelationsModule, ChunksModule],
  providers: [
    {
      provide: CollectDocumentIndexGarbageCommandHandler,
      useFactory: (
        documentIndexRepository: DocumentIndexRepositoryContract,
        jobRepository: DocumentIndexExecutionQueue,
        failedJobRepository: DocumentIndexFailureArchive,
        knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
        relationGarbage: CollectDocumentRelationGarbageCommandHandlerContract,
        chunkGarbage: CollectIndexChunkGarbageCommandHandlerContract,
      ) =>
        new CollectDocumentIndexGarbageCommandHandler(
          documentIndexRepository,
          jobRepository,
          failedJobRepository,
          knowledgeBaseDocumentRetention,
          relationGarbage,
          chunkGarbage,
        ),
      inject: [
        DocumentIndexRepositoryContract,
        DocumentIndexExecutionQueue,
        DocumentIndexFailureArchive,
        InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
        CollectDocumentRelationGarbageCommandHandlerContract,
        CollectIndexChunkGarbageCommandHandlerContract,
      ],
    },
    {
      provide: StartDocumentIndexPruningRetentionCommandHandler,
      useFactory: (
        documentIndexRepository: DocumentIndexRepositoryContract,
        jobRepository: DocumentIndexExecutionQueue,
        knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
      ) =>
        new StartDocumentIndexPruningRetentionCommandHandler(
          documentIndexRepository,
          jobRepository,
          knowledgeBaseDocumentRetention,
        ),
      inject: [
        DocumentIndexRepositoryContract,
        DocumentIndexExecutionQueue,
        InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
      ],
    },
    {
      provide: CollectDocumentIndexGarbageCommandHandlerContract,
      useExisting: CollectDocumentIndexGarbageCommandHandler,
    },
    {
      provide: StartDocumentIndexPruningRetentionCommandHandlerContract,
      useExisting: StartDocumentIndexPruningRetentionCommandHandler,
    },
  ],
  exports: [
    CollectDocumentIndexGarbageCommandHandlerContract,
    StartDocumentIndexPruningRetentionCommandHandlerContract,
  ],
})
export class DocumentIndexRetentionModule {}
