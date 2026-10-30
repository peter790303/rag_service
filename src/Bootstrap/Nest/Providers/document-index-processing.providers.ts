import { type KnowledgeServiceConfig, KNOWLEDGE_SERVICE_CONFIG } from '../../../../config/knowledge-service.config.ts'
import { PlanMarkdownChunksQueryHandlerContract } from '../../../Chunks/Application/Contracts/plan-markdown-chunks.query.handler.contract.ts'
import { ReplaceIndexChunkCommandHandlerContract } from '../../../Chunks/Application/Contracts/replace-index-chunk.command.handler.contract.ts'
import { DocumentIndexedListener } from '../../../DocumentIndexes/Application/Listeners/document-indexed.listener.ts'
import { DocumentIndexingFailedListener } from '../../../DocumentIndexes/Application/Listeners/document-indexing-failed.listener.ts'
import { ProcessDocumentIndexListener } from '../../../DocumentIndexes/Application/Listeners/process-document-index.listener.ts'
import { DocumentIndexExecutionQueue } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../../DocumentIndexes/Application/Ports/Out/Repositories/document-index.repository.ts'
import { LoadDocumentRevisionQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/load-document-revision.query.handler.contract.ts'
import { ReserveDocumentForIndexingCommandHandlerContract } from '../../../Documents/Application/Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import { ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/reserve-knowledge-base-document-for-indexing.command.handler.contract.ts'
import { EmbeddingProvider } from '../../../Shared/Application/Ports/Out/Gateways/embedding-provider.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'

export const documentIndexProcessingProviders = [
  {
    provide: ProcessDocumentIndexListener,
    useFactory: (
      transaction: PersistenceTransactionContract,
      reserveDocumentForIndexing: ReserveDocumentForIndexingCommandHandlerContract,
      reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
      jobs: DocumentIndexExecutionQueue,
      documentIndexRepository: DocumentIndexRepositoryContract,
      replaceIndexChunk: ReplaceIndexChunkCommandHandlerContract,
      documentIndexed: Pick<DocumentIndexedListener, 'handle'>,
      documentIndexingFailed: Pick<DocumentIndexingFailedListener, 'handle'>,
      embeddings: EmbeddingProvider,
      chunkPlanner: PlanMarkdownChunksQueryHandlerContract,
      serviceConfig: KnowledgeServiceConfig,
      loadDocumentRevision: LoadDocumentRevisionQueryHandlerContract,
    ) =>
      new ProcessDocumentIndexListener(
        transaction,
        reserveDocumentForIndexing,
        reserveKnowledgeBaseDocumentForIndexing,
        jobs,
        documentIndexRepository,
        replaceIndexChunk,
        documentIndexed,
        documentIndexingFailed,
        embeddings,
        chunkPlanner,
        serviceConfig.workerLeaseSeconds,
        loadDocumentRevision,
      ),
    inject: [
      PersistenceTransactionContract,
      ReserveDocumentForIndexingCommandHandlerContract,
      ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
      DocumentIndexExecutionQueue,
      DocumentIndexRepositoryContract,
      ReplaceIndexChunkCommandHandlerContract,
      DocumentIndexedListener,
      DocumentIndexingFailedListener,
      EmbeddingProvider,
      PlanMarkdownChunksQueryHandlerContract,
      KNOWLEDGE_SERVICE_CONFIG,
      LoadDocumentRevisionQueryHandlerContract,
    ],
  },
]
