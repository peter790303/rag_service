import { DOCUMENT_INDEX_PIPELINE_SETTINGS } from './indexing-profiles.providers.ts'
import { type KnowledgeServiceConfig, KNOWLEDGE_SERVICE_CONFIG } from '../../../../config/knowledge-service.config.ts'
import {
  type DocumentIndexPipelineSettings,
  WriteRequestDocumentIndexesAssembler,
} from '../../../DocumentIndexes/Application/Assemblers/write-request-document-indexes.assembler.ts'
import { AuthorizeDocumentIndexChunkReplacementCommandHandler } from '../../../DocumentIndexes/Application/Commands/authorize-document-index-chunk-replacement.command.handler.ts'
import { AuthorizeDocumentIndexChunkReplacementCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/authorize-document-index-chunk-replacement.command.handler.contract.ts'
import { StartDocumentIndexPruningRetentionCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/start-document-index-pruning-retention.command.handler.contract.ts'
import { DispatchDocumentIndexingListener } from '../../../DocumentIndexes/Application/Listeners/dispatch-document-indexing.listener.ts'
import { DocumentIndexedListener } from '../../../DocumentIndexes/Application/Listeners/document-indexed.listener.ts'
import { DocumentIndexingFailedListener } from '../../../DocumentIndexes/Application/Listeners/document-indexing-failed.listener.ts'
import { DocumentIndexingRequestedListener } from '../../../DocumentIndexes/Application/Listeners/document-indexing-requested.listener.ts'
import { ReadDocumentIndexingStatusListener } from '../../../DocumentIndexes/Application/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../../DocumentIndexes/Application/Listeners/retry-document-indexing.listener.ts'
import { DocumentIndexExecutionQueue } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-failure.archive.ts'
import { DocumentIndexSuccessArchive } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-success.archive.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../../DocumentIndexes/Application/Ports/Out/Repositories/document-index.repository.ts'
import { GetDocumentRevisionForIndexRetryQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/get-document-revision-for-index-retry.query.handler.contract.ts'
import { PrepareDocumentRevisionForIndexRequestCommandHandlerContract } from '../../../DocumentRevisions/Application/Contracts/prepare-document-revision-for-index-request.command.handler.contract.ts'
import { GetDocumentForIndexRetryQueryHandlerContract } from '../../../Documents/Application/Contracts/get-document-for-index-retry.query.handler.contract.ts'
import { PrepareDocumentForIndexRequestCommandHandlerContract } from '../../../Documents/Application/Contracts/prepare-document-for-index-request.command.handler.contract.ts'
import { ReserveDocumentForIndexingCommandHandlerContract } from '../../../Documents/Application/Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import { ActivateKnowledgeBaseDocumentIndexCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/activate-knowledge-base-document-index.command.handler.contract.ts'
import { CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/complete-knowledge-base-document-indexing.command.handler.contract.ts'
import { GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/get-knowledge-base-document-indexing-state.query.handler.contract.ts'
import { PrepareKnowledgeBaseDocumentForIndexRequestCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/prepare-knowledge-base-document-for-index-request.command.handler.contract.ts'
import { ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/reserve-knowledge-base-document-for-indexing.command.handler.contract.ts'
import { SaveKnowledgeBaseDocumentIndexRequestCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/save-knowledge-base-document-index-request.command.handler.contract.ts'
import { EnsureIndexingKnowledgeBaseCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/ensure-indexing-knowledge-base.command.handler.contract.ts'
import { GetIndexingKnowledgeBaseQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/get-indexing-knowledge-base.query.handler.contract.ts'
import { EmbeddingProvider } from '../../../Shared/Application/Ports/Out/Gateways/embedding-provider.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'

export const documentIndexingProviders = [
  {
    provide: DispatchDocumentIndexingListener,
    useFactory: (
      transaction: PersistenceTransactionContract,
      reserveDocumentForIndexing: ReserveDocumentForIndexingCommandHandlerContract,
      reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
      indexes: DocumentIndexRepositoryContract,
      jobs: DocumentIndexExecutionQueue,
      failedJobs: DocumentIndexFailureArchive,
      serviceConfig: KnowledgeServiceConfig,
      activateKnowledgeBaseDocumentIndex: ActivateKnowledgeBaseDocumentIndexCommandHandlerContract,
      knowledgeBases: GetIndexingKnowledgeBaseQueryHandlerContract,
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
      ReserveDocumentForIndexingCommandHandlerContract,
      ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
      DocumentIndexRepositoryContract,
      DocumentIndexExecutionQueue,
      DocumentIndexFailureArchive,
      KNOWLEDGE_SERVICE_CONFIG,
      ActivateKnowledgeBaseDocumentIndexCommandHandlerContract,
      GetIndexingKnowledgeBaseQueryHandlerContract,
      DocumentIndexSuccessArchive,
    ],
  },
  {
    provide: DocumentIndexedListener,
    useFactory: (
      transaction: PersistenceTransactionContract,
      reserveDocumentForIndexing: ReserveDocumentForIndexingCommandHandlerContract,
      reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
      jobs: DocumentIndexExecutionQueue,
      indexes: DocumentIndexRepositoryContract,
      completeKnowledgeBaseDocumentIndexing: CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract,
      knowledgeBases: GetIndexingKnowledgeBaseQueryHandlerContract,
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
      ReserveDocumentForIndexingCommandHandlerContract,
      ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
      DocumentIndexExecutionQueue,
      DocumentIndexRepositoryContract,
      CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract,
      GetIndexingKnowledgeBaseQueryHandlerContract,
      DocumentIndexSuccessArchive,
    ],
  },
  {
    provide: DocumentIndexingFailedListener,
    useFactory: (
      transaction: PersistenceTransactionContract,
      reserveDocumentForIndexing: ReserveDocumentForIndexingCommandHandlerContract,
      reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
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
      ReserveDocumentForIndexingCommandHandlerContract,
      ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
      DocumentIndexExecutionQueue,
      DocumentIndexRepositoryContract,
      DocumentIndexFailureArchive,
    ],
  },
  {
    provide: ReadDocumentIndexingStatusListener,
    useFactory: (
      jobRepository: DocumentIndexExecutionQueue,
      getKnowledgeBaseDocumentIndexingState: GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract,
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
      GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract,
      DocumentIndexRepositoryContract,
      DocumentIndexFailureArchive,
      DocumentIndexSuccessArchive,
    ],
  },
  {
    provide: AuthorizeDocumentIndexChunkReplacementCommandHandler,
    useFactory: (
      reserveDocumentForIndexingUseCase: ReserveDocumentForIndexingCommandHandlerContract,
      reserveKnowledgeBaseDocumentForIndexingUseCase: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
      jobRepository: DocumentIndexExecutionQueue,
      documentIndexRepository: DocumentIndexRepositoryContract,
    ) =>
      new AuthorizeDocumentIndexChunkReplacementCommandHandler(
        reserveDocumentForIndexingUseCase,
        reserveKnowledgeBaseDocumentForIndexingUseCase,
        jobRepository,
        documentIndexRepository,
      ),
    inject: [
      ReserveDocumentForIndexingCommandHandlerContract,
      ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
      DocumentIndexExecutionQueue,
      DocumentIndexRepositoryContract,
    ],
  },
  {
    provide: DocumentIndexingRequestedListener,
    useFactory: (
      transaction: PersistenceTransactionContract,
      ensureIndexingKnowledgeBase: EnsureIndexingKnowledgeBaseCommandHandlerContract,
      prepareDocumentForIndexRequest: PrepareDocumentForIndexRequestCommandHandlerContract,
      prepareKnowledgeBaseDocumentForIndexRequest: PrepareKnowledgeBaseDocumentForIndexRequestCommandHandlerContract,
      prepareDocumentRevisionForIndexRequest: PrepareDocumentRevisionForIndexRequestCommandHandlerContract,
      indexes: DocumentIndexRepositoryContract,
      jobs: DocumentIndexExecutionQueue,
      failedJobs: DocumentIndexFailureArchive,
      pipelineSettings: DocumentIndexPipelineSettings,
      writeRequestDocumentIndexesAssembler: WriteRequestDocumentIndexesAssembler,
      saveKnowledgeBaseDocumentIndexRequest: SaveKnowledgeBaseDocumentIndexRequestCommandHandlerContract,
      startIndexRetention: StartDocumentIndexPruningRetentionCommandHandlerContract,
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
      EnsureIndexingKnowledgeBaseCommandHandlerContract,
      PrepareDocumentForIndexRequestCommandHandlerContract,
      PrepareKnowledgeBaseDocumentForIndexRequestCommandHandlerContract,
      PrepareDocumentRevisionForIndexRequestCommandHandlerContract,
      DocumentIndexRepositoryContract,
      DocumentIndexExecutionQueue,
      DocumentIndexFailureArchive,
      DOCUMENT_INDEX_PIPELINE_SETTINGS,
      WriteRequestDocumentIndexesAssembler,
      SaveKnowledgeBaseDocumentIndexRequestCommandHandlerContract,
      StartDocumentIndexPruningRetentionCommandHandlerContract,
    ],
  },
  {
    provide: RetryDocumentIndexingListener,
    useFactory: (
      transaction: PersistenceTransactionContract,
      knowledgeBases: GetIndexingKnowledgeBaseQueryHandlerContract,
      documents: GetDocumentForIndexRetryQueryHandlerContract,
      knowledgeBaseDocuments: GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract,
      revisions: GetDocumentRevisionForIndexRetryQueryHandlerContract,
      indexes: DocumentIndexRepositoryContract,
      jobs: DocumentIndexExecutionQueue,
      failedJobs: DocumentIndexFailureArchive,
      embeddings: EmbeddingProvider,
      config: KnowledgeServiceConfig,
      writeRequestDocumentIndexesAssembler: WriteRequestDocumentIndexesAssembler,
      reserveDocumentForIndexing: ReserveDocumentForIndexingCommandHandlerContract,
      reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
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
      GetIndexingKnowledgeBaseQueryHandlerContract,
      GetDocumentForIndexRetryQueryHandlerContract,
      GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract,
      GetDocumentRevisionForIndexRetryQueryHandlerContract,
      DocumentIndexRepositoryContract,
      DocumentIndexExecutionQueue,
      DocumentIndexFailureArchive,
      EmbeddingProvider,
      KNOWLEDGE_SERVICE_CONFIG,
      WriteRequestDocumentIndexesAssembler,
      ReserveDocumentForIndexingCommandHandlerContract,
      ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
    ],
  },
  {
    provide: WriteRequestDocumentIndexesAssembler,
    useFactory: (documentIndexPipelineSettings: DocumentIndexPipelineSettings) =>
      new WriteRequestDocumentIndexesAssembler(documentIndexPipelineSettings),
    inject: [DOCUMENT_INDEX_PIPELINE_SETTINGS],
  },
  {
    provide: AuthorizeDocumentIndexChunkReplacementCommandHandlerContract,
    useExisting: AuthorizeDocumentIndexChunkReplacementCommandHandler,
  },
]
