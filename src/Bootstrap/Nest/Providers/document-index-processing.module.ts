import { Module } from '@nestjs/common'

import { ChunkPlanningModule } from './chunk-planning.module.ts'
import { ChunkReplacementModule } from './chunk-replacement.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentIndexingModule } from './document-indexing.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { EmbeddingModule } from './embedding.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { type KnowledgeServiceConfig, KNOWLEDGE_SERVICE_CONFIG } from '../../../../config/knowledge-service.config.ts'
import { ReplaceIndexChunkCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/replace-index-chunk.command.handler.contract.ts'
import { DocumentIndexedListener } from '../../../DocumentIndexes/Application/Listeners/document-indexed.listener.ts'
import { DocumentIndexingFailedListener } from '../../../DocumentIndexes/Application/Listeners/document-indexing-failed.listener.ts'
import { ProcessDocumentIndexListener } from '../../../DocumentIndexes/Application/Listeners/process-document-index.listener.ts'
import { ChunkPlanningProvider } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/chunk-planning-provider.ts'
import { DocumentIndexExecutionQueue } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../../DocumentIndexes/Application/Ports/Out/Repositories/document-index.repository.ts'
import { LoadDocumentRevisionQueryHandlerContract } from '../../../Documents/Application/Contracts/load-document-revision.query.handler.contract.ts'
import { ReserveDocumentForIndexingCommandHandlerContract } from '../../../Documents/Application/Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import { ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/reserve-knowledge-base-document-for-indexing.command.handler.contract.ts'
import { EmbeddingProvider } from '../../../Shared/Application/Ports/Out/Gateways/embedding-provider.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'

@Module({
  imports: [
    PersistenceModule,
    DocumentsModule,
    KnowledgeBaseDocumentsModule,
    DocumentIndexesModule,
    DocumentRevisionsModule,
    ChunkReplacementModule,
    DocumentIndexingModule,
    EmbeddingModule,
    ChunkPlanningModule,
    KnowledgeServiceConfigModule,
  ],
  providers: [
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
        chunkPlanner: ChunkPlanningProvider,
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
        ChunkPlanningProvider,
        KNOWLEDGE_SERVICE_CONFIG,
        LoadDocumentRevisionQueryHandlerContract,
      ],
    },
  ],
  exports: [ProcessDocumentIndexListener],
})
export class DocumentIndexProcessingModule {}
