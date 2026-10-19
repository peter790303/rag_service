import { Module } from '@nestjs/common'

import { DocumentIndexRetentionModule } from './document-index-retention.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { EmbeddingModule } from './embedding.module.ts'
import { IndexingProfilesModule, DOCUMENT_INDEX_PIPELINE_SETTINGS } from './indexing-profiles.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { type KnowledgeServiceConfig, KNOWLEDGE_SERVICE_CONFIG } from '../../../config/knowledge-service.config.ts'
import {
  type DocumentIndexPipelineSettings,
  WriteRequestDocumentIndexesAssembler,
} from '../../Application/DocumentIndexes/Assemblers/write-request-document-indexes.assembler.ts'
import { AuthorizeDocumentIndexChunkReplacementUseCaseContract } from '../../Application/DocumentIndexes/Contracts/authorize-document-index-chunk-replacement.use-case.contract.ts'
import { DocumentIndexExecutionQueue } from '../../Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../Application/DocumentIndexes/Contracts/document-index-failure.archive.ts'
import { DocumentIndexSuccessArchive } from '../../Application/DocumentIndexes/Contracts/document-index-success.archive.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../Application/DocumentIndexes/Contracts/document-index.repository.ts'
import { StartDocumentIndexPruningRetentionUseCaseContract } from '../../Application/DocumentIndexes/Contracts/start-document-index-pruning-retention.use-case.contract.ts'
import { DispatchDocumentIndexingListener } from '../../Application/DocumentIndexes/Listeners/dispatch-document-indexing.listener.ts'
import { DocumentIndexedListener } from '../../Application/DocumentIndexes/Listeners/document-indexed.listener.ts'
import { DocumentIndexingFailedListener } from '../../Application/DocumentIndexes/Listeners/document-indexing-failed.listener.ts'
import { DocumentIndexingRequestedListener } from '../../Application/DocumentIndexes/Listeners/document-indexing-requested.listener.ts'
import { ReadDocumentIndexingStatusListener } from '../../Application/DocumentIndexes/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../Application/DocumentIndexes/Listeners/retry-document-indexing.listener.ts'
import { AuthorizeDocumentIndexChunkReplacementUseCase } from '../../Application/DocumentIndexes/UseCases/authorize-document-index-chunk-replacement.use-case.ts'
import { GetDocumentRevisionForIndexRetryUseCaseContract } from '../../Application/DocumentRevisions/Contracts/get-document-revision-for-index-retry.use-case.contract.ts'
import { PrepareDocumentRevisionForIndexRequestUseCaseContract } from '../../Application/DocumentRevisions/Contracts/prepare-document-revision-for-index-request.use-case.contract.ts'
import { GetDocumentForIndexRetryUseCaseContract } from '../../Application/Documents/Contracts/get-document-for-index-retry.use-case.contract.ts'
import { PrepareDocumentForIndexRequestUseCaseContract } from '../../Application/Documents/Contracts/prepare-document-for-index-request.use-case.contract.ts'
import { ReserveDocumentForIndexingUseCaseContract } from '../../Application/Documents/Contracts/reserve-document-for-indexing.use-case.contract.ts'
import { ActivateKnowledgeBaseDocumentIndexUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/activate-knowledge-base-document-index.use-case.contract.ts'
import { CompleteKnowledgeBaseDocumentIndexingUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/complete-knowledge-base-document-indexing.use-case.contract.ts'
import { GetKnowledgeBaseDocumentIndexingStateUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/get-knowledge-base-document-indexing-state.use-case.contract.ts'
import { PrepareKnowledgeBaseDocumentForIndexRequestUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/prepare-knowledge-base-document-for-index-request.use-case.contract.ts'
import { ReserveKnowledgeBaseDocumentForIndexingUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/reserve-knowledge-base-document-for-indexing.use-case.contract.ts'
import { SaveKnowledgeBaseDocumentIndexRequestUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/save-knowledge-base-document-index-request.use-case.contract.ts'
import { EmbeddingProvider } from '../../Application/KnowledgeBases/Contracts/embedding-provider.ts'
import { EnsureIndexingKnowledgeBaseUseCaseContract } from '../../Application/KnowledgeBases/Contracts/ensure-indexing-knowledge-base.use-case.contract.ts'
import { GetIndexingKnowledgeBaseUseCaseContract } from '../../Application/KnowledgeBases/Contracts/get-indexing-knowledge-base.use-case.contract.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../Application/KnowledgeBases/Contracts/persistence-transaction.ts'

@Module({
  imports: [
    PersistenceModule,
    DocumentsModule,
    KnowledgeBaseDocumentsModule,
    DocumentIndexesModule,
    DocumentIndexRetentionModule,
    KnowledgeServiceConfigModule,
    KnowledgeBasesModule,
    DocumentRevisionsModule,
    IndexingProfilesModule,
    EmbeddingModule,
  ],
  providers: [
    {
      provide: DispatchDocumentIndexingListener,
      useFactory: (
        transaction: PersistenceTransactionContract,
        reserveDocumentForIndexing: ReserveDocumentForIndexingUseCaseContract,
        reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
        indexes: DocumentIndexRepositoryContract,
        jobs: DocumentIndexExecutionQueue,
        failedJobs: DocumentIndexFailureArchive,
        serviceConfig: KnowledgeServiceConfig,
        activateKnowledgeBaseDocumentIndex: ActivateKnowledgeBaseDocumentIndexUseCaseContract,
        knowledgeBases: GetIndexingKnowledgeBaseUseCaseContract,
        successReceipts: DocumentIndexSuccessArchive,
      ) =>
        new DispatchDocumentIndexingListener(
          transaction,
          reserveDocumentForIndexing,
          reserveKnowledgeBaseDocumentForIndexing,
          indexes,
          jobs,
          failedJobs,
          serviceConfig.workerLeaseSeconds,
          activateKnowledgeBaseDocumentIndex,
          knowledgeBases,
          successReceipts,
        ),
      inject: [
        PersistenceTransactionContract,
        ReserveDocumentForIndexingUseCaseContract,
        ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
        DocumentIndexRepositoryContract,
        DocumentIndexExecutionQueue,
        DocumentIndexFailureArchive,
        KNOWLEDGE_SERVICE_CONFIG,
        ActivateKnowledgeBaseDocumentIndexUseCaseContract,
        GetIndexingKnowledgeBaseUseCaseContract,
        DocumentIndexSuccessArchive,
      ],
    },
    {
      provide: DocumentIndexedListener,
      useFactory: (
        transaction: PersistenceTransactionContract,
        reserveDocumentForIndexing: ReserveDocumentForIndexingUseCaseContract,
        reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
        jobs: DocumentIndexExecutionQueue,
        indexes: DocumentIndexRepositoryContract,
        completeKnowledgeBaseDocumentIndexing: CompleteKnowledgeBaseDocumentIndexingUseCaseContract,
        knowledgeBases: GetIndexingKnowledgeBaseUseCaseContract,
        successReceipts: DocumentIndexSuccessArchive,
      ) =>
        new DocumentIndexedListener(
          transaction,
          reserveDocumentForIndexing,
          reserveKnowledgeBaseDocumentForIndexing,
          jobs,
          indexes,
          completeKnowledgeBaseDocumentIndexing,
          knowledgeBases,
          successReceipts,
        ),
      inject: [
        PersistenceTransactionContract,
        ReserveDocumentForIndexingUseCaseContract,
        ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
        DocumentIndexExecutionQueue,
        DocumentIndexRepositoryContract,
        CompleteKnowledgeBaseDocumentIndexingUseCaseContract,
        GetIndexingKnowledgeBaseUseCaseContract,
        DocumentIndexSuccessArchive,
      ],
    },
    {
      provide: DocumentIndexingFailedListener,
      useFactory: (
        transaction: PersistenceTransactionContract,
        reserveDocumentForIndexing: ReserveDocumentForIndexingUseCaseContract,
        reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
        jobs: DocumentIndexExecutionQueue,
        indexes: DocumentIndexRepositoryContract,
        failedJobs: DocumentIndexFailureArchive,
      ) =>
        new DocumentIndexingFailedListener(
          transaction,
          reserveDocumentForIndexing,
          reserveKnowledgeBaseDocumentForIndexing,
          jobs,
          indexes,
          failedJobs,
        ),
      inject: [
        PersistenceTransactionContract,
        ReserveDocumentForIndexingUseCaseContract,
        ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
        DocumentIndexExecutionQueue,
        DocumentIndexRepositoryContract,
        DocumentIndexFailureArchive,
      ],
    },
    {
      provide: ReadDocumentIndexingStatusListener,
      useFactory: (
        jobRepository: DocumentIndexExecutionQueue,
        getKnowledgeBaseDocumentIndexingState: GetKnowledgeBaseDocumentIndexingStateUseCaseContract,
        documentIndexRepository: DocumentIndexRepositoryContract,
        failedJobRepository: DocumentIndexFailureArchive,
        successReceiptRepository: DocumentIndexSuccessArchive,
      ) =>
        new ReadDocumentIndexingStatusListener(
          jobRepository,
          getKnowledgeBaseDocumentIndexingState,
          documentIndexRepository,
          failedJobRepository,
          successReceiptRepository,
        ),
      inject: [
        DocumentIndexExecutionQueue,
        GetKnowledgeBaseDocumentIndexingStateUseCaseContract,
        DocumentIndexRepositoryContract,
        DocumentIndexFailureArchive,
        DocumentIndexSuccessArchive,
      ],
    },
    {
      provide: AuthorizeDocumentIndexChunkReplacementUseCase,
      useFactory: (
        reserveDocumentForIndexingUseCase: ReserveDocumentForIndexingUseCaseContract,
        reserveKnowledgeBaseDocumentForIndexingUseCase: ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
        jobRepository: DocumentIndexExecutionQueue,
        documentIndexRepository: DocumentIndexRepositoryContract,
      ) =>
        new AuthorizeDocumentIndexChunkReplacementUseCase(
          reserveDocumentForIndexingUseCase,
          reserveKnowledgeBaseDocumentForIndexingUseCase,
          jobRepository,
          documentIndexRepository,
        ),
      inject: [
        ReserveDocumentForIndexingUseCaseContract,
        ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
        DocumentIndexExecutionQueue,
        DocumentIndexRepositoryContract,
      ],
    },
    {
      provide: DocumentIndexingRequestedListener,
      useFactory: (
        transaction: PersistenceTransactionContract,
        ensureIndexingKnowledgeBase: EnsureIndexingKnowledgeBaseUseCaseContract,
        prepareDocumentForIndexRequest: PrepareDocumentForIndexRequestUseCaseContract,
        prepareKnowledgeBaseDocumentForIndexRequest: PrepareKnowledgeBaseDocumentForIndexRequestUseCaseContract,
        prepareDocumentRevisionForIndexRequest: PrepareDocumentRevisionForIndexRequestUseCaseContract,
        indexes: DocumentIndexRepositoryContract,
        jobs: DocumentIndexExecutionQueue,
        failedJobs: DocumentIndexFailureArchive,
        pipelineSettings: DocumentIndexPipelineSettings,
        writeRequestDocumentIndexesAssembler: WriteRequestDocumentIndexesAssembler,
        saveKnowledgeBaseDocumentIndexRequest: SaveKnowledgeBaseDocumentIndexRequestUseCaseContract,
        startIndexRetention: StartDocumentIndexPruningRetentionUseCaseContract,
      ) =>
        new DocumentIndexingRequestedListener(
          transaction,
          ensureIndexingKnowledgeBase,
          prepareDocumentForIndexRequest,
          prepareKnowledgeBaseDocumentForIndexRequest,
          prepareDocumentRevisionForIndexRequest,
          indexes,
          jobs,
          failedJobs,
          pipelineSettings,
          writeRequestDocumentIndexesAssembler,
          saveKnowledgeBaseDocumentIndexRequest,
          startIndexRetention,
        ),
      inject: [
        PersistenceTransactionContract,
        EnsureIndexingKnowledgeBaseUseCaseContract,
        PrepareDocumentForIndexRequestUseCaseContract,
        PrepareKnowledgeBaseDocumentForIndexRequestUseCaseContract,
        PrepareDocumentRevisionForIndexRequestUseCaseContract,
        DocumentIndexRepositoryContract,
        DocumentIndexExecutionQueue,
        DocumentIndexFailureArchive,
        DOCUMENT_INDEX_PIPELINE_SETTINGS,
        WriteRequestDocumentIndexesAssembler,
        SaveKnowledgeBaseDocumentIndexRequestUseCaseContract,
        StartDocumentIndexPruningRetentionUseCaseContract,
      ],
    },
    {
      provide: RetryDocumentIndexingListener,
      useFactory: (
        transaction: PersistenceTransactionContract,
        knowledgeBases: GetIndexingKnowledgeBaseUseCaseContract,
        documents: GetDocumentForIndexRetryUseCaseContract,
        knowledgeBaseDocuments: GetKnowledgeBaseDocumentIndexingStateUseCaseContract,
        revisions: GetDocumentRevisionForIndexRetryUseCaseContract,
        indexes: DocumentIndexRepositoryContract,
        jobs: DocumentIndexExecutionQueue,
        failedJobs: DocumentIndexFailureArchive,
        embeddings: EmbeddingProvider,
        config: KnowledgeServiceConfig,
        writeRequestDocumentIndexesAssembler: WriteRequestDocumentIndexesAssembler,
        reserveDocumentForIndexing: ReserveDocumentForIndexingUseCaseContract,
        reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
      ) =>
        new RetryDocumentIndexingListener(
          transaction,
          knowledgeBases,
          documents,
          knowledgeBaseDocuments,
          revisions,
          indexes,
          jobs,
          failedJobs,
          embeddings,
          config,
          writeRequestDocumentIndexesAssembler,
          reserveDocumentForIndexing,
          reserveKnowledgeBaseDocumentForIndexing,
        ),
      inject: [
        PersistenceTransactionContract,
        GetIndexingKnowledgeBaseUseCaseContract,
        GetDocumentForIndexRetryUseCaseContract,
        GetKnowledgeBaseDocumentIndexingStateUseCaseContract,
        GetDocumentRevisionForIndexRetryUseCaseContract,
        DocumentIndexRepositoryContract,
        DocumentIndexExecutionQueue,
        DocumentIndexFailureArchive,
        EmbeddingProvider,
        KNOWLEDGE_SERVICE_CONFIG,
        WriteRequestDocumentIndexesAssembler,
        ReserveDocumentForIndexingUseCaseContract,
        ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
      ],
    },
    {
      provide: WriteRequestDocumentIndexesAssembler,
      useFactory: (documentIndexPipelineSettings: DocumentIndexPipelineSettings) =>
        new WriteRequestDocumentIndexesAssembler(documentIndexPipelineSettings),
      inject: [DOCUMENT_INDEX_PIPELINE_SETTINGS],
    },
    {
      provide: AuthorizeDocumentIndexChunkReplacementUseCaseContract,
      useExisting: AuthorizeDocumentIndexChunkReplacementUseCase,
    },
  ],
  exports: [
    AuthorizeDocumentIndexChunkReplacementUseCaseContract,
    DocumentIndexedListener,
    DocumentIndexingFailedListener,
    DispatchDocumentIndexingListener,
    ReadDocumentIndexingStatusListener,
    DocumentIndexingRequestedListener,
    RetryDocumentIndexingListener,
  ],
})
export class DocumentIndexingModule {}
