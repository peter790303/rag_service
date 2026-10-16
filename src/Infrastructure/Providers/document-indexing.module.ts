import { Module } from '@nestjs/common'

import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { EmbeddingModule } from './embedding.module.ts'
import { IndexingProfilesModule, DOCUMENT_INDEX_PIPELINE_SETTINGS } from './indexing-profiles.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { MembershipsModule } from './memberships.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { type KnowledgeServiceConfig, KNOWLEDGE_SERVICE_CONFIG } from '../../../config/knowledge-service.config.ts'
import {
  type DocumentIndexPipelineSettings,
  WriteRequestDocumentIndexesAssembler,
} from '../../Application/DocumentIndexes/Assemblers/write-request-document-indexes.assembler.ts'
import { DocumentIndexChunkReplacementRequestedListenerContract } from '../../Application/DocumentIndexes/Contracts/document-index-chunk-replacement-requested.listener.contract.ts'
import { DocumentIndexExecutionQueue } from '../../Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../Application/DocumentIndexes/Contracts/document-index-failure.archive.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../Application/DocumentIndexes/Contracts/document-index.repository.ts'
import { DispatchDocumentIndexingListener } from '../../Application/DocumentIndexes/Listeners/dispatch-document-indexing.listener.ts'
import { DocumentIndexChunkReplacementRequestedListener } from '../../Application/DocumentIndexes/Listeners/document-index-chunk-replacement-requested.listener.ts'
import { DocumentIndexedListener } from '../../Application/DocumentIndexes/Listeners/document-indexed.listener.ts'
import { DocumentIndexingFailedListener } from '../../Application/DocumentIndexes/Listeners/document-indexing-failed.listener.ts'
import { DocumentIndexingRequestedListener } from '../../Application/DocumentIndexes/Listeners/document-indexing-requested.listener.ts'
import { ReadDocumentIndexingStatusListener } from '../../Application/DocumentIndexes/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../Application/DocumentIndexes/Listeners/retry-document-indexing.listener.ts'
import { GetDocumentRevisionForIndexRetryUseCaseContract } from '../../Application/DocumentRevisions/Contracts/get-document-revision-for-index-retry.use-case.contract.ts'
import { PrepareDocumentRevisionForIndexRequestUseCaseContract } from '../../Application/DocumentRevisions/Contracts/prepare-document-revision-for-index-request.use-case.contract.ts'
import { GetDocumentForIndexRetryUseCaseContract } from '../../Application/Documents/Contracts/get-document-for-index-retry.use-case.contract.ts'
import { PrepareDocumentForIndexRequestUseCaseContract } from '../../Application/Documents/Contracts/prepare-document-for-index-request.use-case.contract.ts'
import { ReserveDocumentForIndexingUseCaseContract } from '../../Application/Documents/Contracts/reserve-document-for-indexing.use-case.contract.ts'
import { EmbeddingProvider } from '../../Application/KnowledgeBases/Contracts/embedding-provider.ts'
import { EnsureIndexingKnowledgeBaseUseCaseContract } from '../../Application/KnowledgeBases/Contracts/ensure-indexing-knowledge-base.use-case.contract.ts'
import { GetIndexingKnowledgeBaseUseCaseContract } from '../../Application/KnowledgeBases/Contracts/get-indexing-knowledge-base.use-case.contract.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../Application/KnowledgeBases/Contracts/persistence-transaction.ts'
import { ActivateMembershipIndexUseCaseContract } from '../../Application/Memberships/Contracts/activate-membership-index.use-case.contract.ts'
import { CompleteMembershipIndexingUseCaseContract } from '../../Application/Memberships/Contracts/complete-membership-indexing.use-case.contract.ts'
import { GetMembershipIndexingStateUseCaseContract } from '../../Application/Memberships/Contracts/get-membership-indexing-state.use-case.contract.ts'
import { PrepareMembershipForIndexRequestUseCaseContract } from '../../Application/Memberships/Contracts/prepare-membership-for-index-request.use-case.contract.ts'
import { ReserveMembershipForIndexingUseCaseContract } from '../../Application/Memberships/Contracts/reserve-membership-for-indexing.use-case.contract.ts'
import { SaveMembershipIndexRequestUseCaseContract } from '../../Application/Memberships/Contracts/save-membership-index-request.use-case.contract.ts'

@Module({
  imports: [
    PersistenceModule,
    DocumentsModule,
    MembershipsModule,
    DocumentIndexesModule,
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
        reserveMembershipForIndexing: ReserveMembershipForIndexingUseCaseContract,
        indexes: DocumentIndexRepositoryContract,
        jobs: DocumentIndexExecutionQueue,
        failedJobs: DocumentIndexFailureArchive,
        serviceConfig: KnowledgeServiceConfig,
        activateMembershipIndex: ActivateMembershipIndexUseCaseContract,
      ) =>
        new DispatchDocumentIndexingListener(
          transaction,
          reserveDocumentForIndexing,
          reserveMembershipForIndexing,
          indexes,
          jobs,
          failedJobs,
          serviceConfig.workerLeaseSeconds,
          activateMembershipIndex,
        ),
      inject: [
        PersistenceTransactionContract,
        ReserveDocumentForIndexingUseCaseContract,
        ReserveMembershipForIndexingUseCaseContract,
        DocumentIndexRepositoryContract,
        DocumentIndexExecutionQueue,
        DocumentIndexFailureArchive,
        KNOWLEDGE_SERVICE_CONFIG,
        ActivateMembershipIndexUseCaseContract,
      ],
    },
    {
      provide: DocumentIndexedListener,
      useFactory: (
        transaction: PersistenceTransactionContract,
        reserveDocumentForIndexing: ReserveDocumentForIndexingUseCaseContract,
        reserveMembershipForIndexing: ReserveMembershipForIndexingUseCaseContract,
        jobs: DocumentIndexExecutionQueue,
        indexes: DocumentIndexRepositoryContract,
        completeMembershipIndexing: CompleteMembershipIndexingUseCaseContract,
      ) =>
        new DocumentIndexedListener(
          transaction,
          reserveDocumentForIndexing,
          reserveMembershipForIndexing,
          jobs,
          indexes,
          completeMembershipIndexing,
        ),
      inject: [
        PersistenceTransactionContract,
        ReserveDocumentForIndexingUseCaseContract,
        ReserveMembershipForIndexingUseCaseContract,
        DocumentIndexExecutionQueue,
        DocumentIndexRepositoryContract,
        CompleteMembershipIndexingUseCaseContract,
      ],
    },
    {
      provide: DocumentIndexingFailedListener,
      useFactory: (
        transaction: PersistenceTransactionContract,
        reserveDocumentForIndexing: ReserveDocumentForIndexingUseCaseContract,
        reserveMembershipForIndexing: ReserveMembershipForIndexingUseCaseContract,
        jobs: DocumentIndexExecutionQueue,
        indexes: DocumentIndexRepositoryContract,
        failedJobs: DocumentIndexFailureArchive,
      ) =>
        new DocumentIndexingFailedListener(
          transaction,
          reserveDocumentForIndexing,
          reserveMembershipForIndexing,
          jobs,
          indexes,
          failedJobs,
        ),
      inject: [
        PersistenceTransactionContract,
        ReserveDocumentForIndexingUseCaseContract,
        ReserveMembershipForIndexingUseCaseContract,
        DocumentIndexExecutionQueue,
        DocumentIndexRepositoryContract,
        DocumentIndexFailureArchive,
      ],
    },
    {
      provide: ReadDocumentIndexingStatusListener,
      useFactory: (
        jobRepository: DocumentIndexExecutionQueue,
        getMembershipIndexingState: GetMembershipIndexingStateUseCaseContract,
        documentIndexRepository: DocumentIndexRepositoryContract,
        failedJobRepository: DocumentIndexFailureArchive,
      ) =>
        new ReadDocumentIndexingStatusListener(
          jobRepository,
          getMembershipIndexingState,
          documentIndexRepository,
          failedJobRepository,
        ),
      inject: [
        DocumentIndexExecutionQueue,
        GetMembershipIndexingStateUseCaseContract,
        DocumentIndexRepositoryContract,
        DocumentIndexFailureArchive,
      ],
    },
    {
      provide: DocumentIndexChunkReplacementRequestedListener,
      useFactory: (
        reserveDocumentForIndexingUseCase: ReserveDocumentForIndexingUseCaseContract,
        reserveMembershipForIndexingUseCase: ReserveMembershipForIndexingUseCaseContract,
        jobRepository: DocumentIndexExecutionQueue,
        documentIndexRepository: DocumentIndexRepositoryContract,
      ) =>
        new DocumentIndexChunkReplacementRequestedListener(
          reserveDocumentForIndexingUseCase,
          reserveMembershipForIndexingUseCase,
          jobRepository,
          documentIndexRepository,
        ),
      inject: [
        ReserveDocumentForIndexingUseCaseContract,
        ReserveMembershipForIndexingUseCaseContract,
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
        prepareMembershipForIndexRequest: PrepareMembershipForIndexRequestUseCaseContract,
        prepareDocumentRevisionForIndexRequest: PrepareDocumentRevisionForIndexRequestUseCaseContract,
        indexes: DocumentIndexRepositoryContract,
        jobs: DocumentIndexExecutionQueue,
        failedJobs: DocumentIndexFailureArchive,
        pipelineSettings: DocumentIndexPipelineSettings,
        writeRequestDocumentIndexesAssembler: WriteRequestDocumentIndexesAssembler,
        saveMembershipIndexRequest: SaveMembershipIndexRequestUseCaseContract,
      ) =>
        new DocumentIndexingRequestedListener(
          transaction,
          ensureIndexingKnowledgeBase,
          prepareDocumentForIndexRequest,
          prepareMembershipForIndexRequest,
          prepareDocumentRevisionForIndexRequest,
          indexes,
          jobs,
          failedJobs,
          pipelineSettings,
          writeRequestDocumentIndexesAssembler,
          saveMembershipIndexRequest,
        ),
      inject: [
        PersistenceTransactionContract,
        EnsureIndexingKnowledgeBaseUseCaseContract,
        PrepareDocumentForIndexRequestUseCaseContract,
        PrepareMembershipForIndexRequestUseCaseContract,
        PrepareDocumentRevisionForIndexRequestUseCaseContract,
        DocumentIndexRepositoryContract,
        DocumentIndexExecutionQueue,
        DocumentIndexFailureArchive,
        DOCUMENT_INDEX_PIPELINE_SETTINGS,
        WriteRequestDocumentIndexesAssembler,
        SaveMembershipIndexRequestUseCaseContract,
      ],
    },
    {
      provide: RetryDocumentIndexingListener,
      useFactory: (
        transaction: PersistenceTransactionContract,
        knowledgeBases: GetIndexingKnowledgeBaseUseCaseContract,
        documents: GetDocumentForIndexRetryUseCaseContract,
        memberships: GetMembershipIndexingStateUseCaseContract,
        revisions: GetDocumentRevisionForIndexRetryUseCaseContract,
        indexes: DocumentIndexRepositoryContract,
        jobs: DocumentIndexExecutionQueue,
        failedJobs: DocumentIndexFailureArchive,
        embeddings: EmbeddingProvider,
        config: KnowledgeServiceConfig,
        writeRequestDocumentIndexesAssembler: WriteRequestDocumentIndexesAssembler,
        reserveDocumentForIndexing: ReserveDocumentForIndexingUseCaseContract,
        reserveMembershipForIndexing: ReserveMembershipForIndexingUseCaseContract,
      ) =>
        new RetryDocumentIndexingListener(
          transaction,
          knowledgeBases,
          documents,
          memberships,
          revisions,
          indexes,
          jobs,
          failedJobs,
          embeddings,
          config,
          writeRequestDocumentIndexesAssembler,
          reserveDocumentForIndexing,
          reserveMembershipForIndexing,
        ),
      inject: [
        PersistenceTransactionContract,
        GetIndexingKnowledgeBaseUseCaseContract,
        GetDocumentForIndexRetryUseCaseContract,
        GetMembershipIndexingStateUseCaseContract,
        GetDocumentRevisionForIndexRetryUseCaseContract,
        DocumentIndexRepositoryContract,
        DocumentIndexExecutionQueue,
        DocumentIndexFailureArchive,
        EmbeddingProvider,
        KNOWLEDGE_SERVICE_CONFIG,
        WriteRequestDocumentIndexesAssembler,
        ReserveDocumentForIndexingUseCaseContract,
        ReserveMembershipForIndexingUseCaseContract,
      ],
    },
    {
      provide: WriteRequestDocumentIndexesAssembler,
      useFactory: (documentIndexPipelineSettings: DocumentIndexPipelineSettings) =>
        new WriteRequestDocumentIndexesAssembler(documentIndexPipelineSettings),
      inject: [DOCUMENT_INDEX_PIPELINE_SETTINGS],
    },
    {
      provide: DocumentIndexChunkReplacementRequestedListenerContract,
      useExisting: DocumentIndexChunkReplacementRequestedListener,
    },
  ],
  exports: [
    DocumentIndexChunkReplacementRequestedListenerContract,
    DocumentIndexedListener,
    DocumentIndexingFailedListener,
    DispatchDocumentIndexingListener,
    ReadDocumentIndexingStatusListener,
    DocumentIndexingRequestedListener,
    RetryDocumentIndexingListener,
  ],
})
export class DocumentIndexingModule {}
