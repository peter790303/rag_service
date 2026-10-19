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
import { type KnowledgeServiceConfig, KNOWLEDGE_SERVICE_CONFIG } from '../../../config/knowledge-service.config.ts'
import { ChunkPlanningProvider } from '../../Application/Chunks/Contracts/chunk-planning-provider.ts'
import { ReplaceIndexChunkUseCaseContract } from '../../Application/Chunks/Contracts/replace-index-chunk.use-case.contract.ts'
import { DocumentIndexExecutionQueue } from '../../Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../Application/DocumentIndexes/Contracts/document-index.repository.ts'
import { DocumentIndexedListener } from '../../Application/DocumentIndexes/Listeners/document-indexed.listener.ts'
import { DocumentIndexingFailedListener } from '../../Application/DocumentIndexes/Listeners/document-indexing-failed.listener.ts'
import { ProcessDocumentIndexListener } from '../../Application/DocumentIndexes/Listeners/process-document-index.listener.ts'
import { LoadDocumentRevisionUseCaseContract } from '../../Application/DocumentRevisions/Contracts/load-document-revision.use-case.contract.ts'
import { ReserveDocumentForIndexingUseCaseContract } from '../../Application/Documents/Contracts/reserve-document-for-indexing.use-case.contract.ts'
import { ReserveKnowledgeBaseDocumentForIndexingUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/reserve-knowledge-base-document-for-indexing.use-case.contract.ts'
import { EmbeddingProvider } from '../../Application/KnowledgeBases/Contracts/embedding-provider.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../Application/KnowledgeBases/Contracts/persistence-transaction.ts'

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
        reserveDocumentForIndexing: ReserveDocumentForIndexingUseCaseContract,
        reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
        jobs: DocumentIndexExecutionQueue,
        documentIndexRepository: DocumentIndexRepositoryContract,
        replaceIndexChunk: ReplaceIndexChunkUseCaseContract,
        documentIndexed: Pick<DocumentIndexedListener, 'handle'>,
        documentIndexingFailed: Pick<DocumentIndexingFailedListener, 'handle'>,
        embeddings: EmbeddingProvider,
        chunkPlanner: ChunkPlanningProvider,
        serviceConfig: KnowledgeServiceConfig,
        loadDocumentRevision: LoadDocumentRevisionUseCaseContract,
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
        ReserveDocumentForIndexingUseCaseContract,
        ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
        DocumentIndexExecutionQueue,
        DocumentIndexRepositoryContract,
        ReplaceIndexChunkUseCaseContract,
        DocumentIndexedListener,
        DocumentIndexingFailedListener,
        EmbeddingProvider,
        ChunkPlanningProvider,
        KNOWLEDGE_SERVICE_CONFIG,
        LoadDocumentRevisionUseCaseContract,
      ],
    },
  ],
  exports: [ProcessDocumentIndexListener],
})
export class DocumentIndexProcessingModule {}
