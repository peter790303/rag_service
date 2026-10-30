import { CollectIndexChunkGarbageCommandHandlerContract } from '../../../Chunks/Application/Contracts/collect-index-chunk-garbage.command.handler.contract.ts'
import { CollectDocumentIndexFailureGarbageCommandHandler } from '../../../DocumentIndexes/Application/Commands/collect-document-index-failure-garbage.command.handler.ts'
import { CollectDocumentIndexGarbageCommandHandler } from '../../../DocumentIndexes/Application/Commands/collect-document-index-garbage.command.handler.ts'
import { StartDocumentIndexPruningRetentionCommandHandler } from '../../../DocumentIndexes/Application/Commands/start-document-index-pruning-retention.command.handler.ts'
import { CollectDocumentIndexFailureGarbageCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/collect-document-index-failure-garbage.command.handler.contract.ts'
import { CollectDocumentIndexGarbageCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/collect-document-index-garbage.command.handler.contract.ts'
import { InspectDocumentIndexExecutionRetentionQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/inspect-document-index-execution-retention.query.handler.contract.ts'
import { StartDocumentIndexPruningRetentionCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/start-document-index-pruning-retention.command.handler.contract.ts'
import { DocumentIndexExecutionQueue } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-failure.archive.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../../DocumentIndexes/Application/Ports/Out/Repositories/document-index.repository.ts'
import { InspectDocumentIndexExecutionRetentionQueryHandler } from '../../../DocumentIndexes/Application/Queries/inspect-document-index-execution-retention.query.handler.ts'
import { CollectDocumentRelationGarbageCommandHandlerContract } from '../../../DocumentRelations/Application/Contracts/collect-document-relation-garbage.command.handler.contract.ts'
import { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'

export const documentIndexRetentionProviders = [
  {
    provide: CollectDocumentIndexFailureGarbageCommandHandlerContract,
    useFactory: (queue: DocumentIndexExecutionQueue, archive: DocumentIndexFailureArchive) =>
      new CollectDocumentIndexFailureGarbageCommandHandler(queue, archive),
    inject: [DocumentIndexExecutionQueue, DocumentIndexFailureArchive],
  },
  {
    provide: InspectDocumentIndexExecutionRetentionQueryHandlerContract,
    useFactory: (queue: DocumentIndexExecutionQueue, archive: DocumentIndexFailureArchive) =>
      new InspectDocumentIndexExecutionRetentionQueryHandler(queue, archive),
    inject: [DocumentIndexExecutionQueue, DocumentIndexFailureArchive],
  },
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
]
