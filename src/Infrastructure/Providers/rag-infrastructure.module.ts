import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { RagConfigModule } from './rag-config.module.js'
import { RAG_CONFIG, type RagConfig } from '../../../config/rag.config.js'
import {
  RagIndexRequestAssembler,
  type RagIndexPipelineSettings,
} from '../../Application/KnowledgeBases/Assemblers/rag-index-request.assembler.js'
import { ChunkPlanningProvider } from '../../Application/KnowledgeBases/Contracts/chunk-planning-provider.js'
import { EmbeddingProvider } from '../../Application/KnowledgeBases/Contracts/embedding-provider.js'
import { RagCryptographyProvider } from '../../Application/KnowledgeBases/Contracts/rag-cryptography-provider.js'
import { RagIndexChunkReplacementStore } from '../../Application/KnowledgeBases/Contracts/rag-index-chunk-replacement-store.js'
import { RagIndexCompletionTransactionRepository } from '../../Application/KnowledgeBases/Contracts/rag-index-completion-transaction.js'
import { RagIndexRequestTransactionRepository } from '../../Application/KnowledgeBases/Contracts/rag-index-request-transaction.js'
import {
  RagIndexProcessingRepository,
  RagJobFailureStore,
} from '../../Application/KnowledgeBases/Contracts/rag-indexing-repository.js'
import { RagJobClaimTransactionBoundary } from '../../Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'
import {
  RagFailedJobRetryStore,
  RagJobStatusReader,
} from '../../Application/KnowledgeBases/Contracts/rag-job-management.js'
import { RagLexicalSearchFormatter } from '../../Application/KnowledgeBases/Contracts/rag-lexical-search-formatter.js'
import {
  RagGarbageCollectionStore,
  RagMembershipPruningStore,
} from '../../Application/KnowledgeBases/Contracts/rag-retention-store.js'
import { RagRetrievalStore } from '../../Application/KnowledgeBases/Contracts/rag-retrieval-store.js'
import { RagServiceAuthenticatorPort } from '../../Application/KnowledgeBases/Contracts/rag-service-authenticator.js'
import { ClaimNextRagJobUseCase } from '../../Application/KnowledgeBases/UseCases/claim-next-rag-job.use-case.js'
import { CollectRagGarbageUseCase } from '../../Application/KnowledgeBases/UseCases/collect-rag-garbage.use-case.js'
import { CompleteRagIndexJobUseCase } from '../../Application/KnowledgeBases/UseCases/complete-rag-index-job.use-case.js'
import { FailRagIndexJobUseCase } from '../../Application/KnowledgeBases/UseCases/fail-rag-index-job.use-case.js'
import { GetRagJobStatusUseCase } from '../../Application/KnowledgeBases/UseCases/get-rag-job-status.use-case.js'
import { ProcessRagIndexJobUseCase } from '../../Application/KnowledgeBases/UseCases/process-rag-index-job.use-case.js'
import { PruneRagMembershipsUseCase } from '../../Application/KnowledgeBases/UseCases/prune-rag-memberships.use-case.js'
import { ReplaceIndexChunkUseCase } from '../../Application/KnowledgeBases/UseCases/replace-index-chunk.use-case.js'
import { RequestRagIndexUseCase } from '../../Application/KnowledgeBases/UseCases/request-rag-index.use-case.js'
import { RetrieveRagUseCase } from '../../Application/KnowledgeBases/UseCases/retrieve-rag.use-case.js'
import { RetryFailedRagJobUseCase } from '../../Application/KnowledgeBases/UseCases/retry-failed-rag-job.use-case.js'
import { MarkdownChunkFactory } from '../../Domain/Knowledge/markdown-chunk.factory.js'
import { RagServiceAuthenticator } from '../Auth/rag-service-authenticator.js'
import { HttpChunkPlanningClient } from '../External/ChunkPlanning/http-chunk-planning.client.js'
import { NodeRagCryptographyAdapter } from '../External/Cryptography/Adapter/node-rag-cryptography.adapter.js'
import { HttpEmbeddingClient } from '../External/Embedding/http-embedding.client.js'
import {
  LEXICAL_PROFILE_VERSION,
  PersistenceRagLexicalSearchFormatter,
} from '../Persistence/Formatters/rag-lexical-search.formatter.js'
import { RagChunkModel } from '../Persistence/Models/rag-chunk.model.js'
import { RagDocumentIndexModel } from '../Persistence/Models/rag-document-index.model.js'
import { RagDocumentRelationModel } from '../Persistence/Models/rag-document-relation.model.js'
import { RagDocumentRevisionModel } from '../Persistence/Models/rag-document-revision.model.js'
import { RagDocumentModel } from '../Persistence/Models/rag-document.model.js'
import { RagFailedJobModel } from '../Persistence/Models/rag-failed-job.model.js'
import { RagJobModel } from '../Persistence/Models/rag-job.model.js'
import { RagKnowledgeBaseModel } from '../Persistence/Models/rag-knowledge-base.model.js'
import { RagMembershipModel } from '../Persistence/Models/rag-membership.model.js'
import { TypeOrmRagChunkRepository } from '../Persistence/Repositories/typeorm-rag-chunk.repository.js'
import { TypeOrmRagDocumentIndexRepository } from '../Persistence/Repositories/typeorm-rag-document-index.repository.js'
import { TypeOrmRagDocumentRelationRepository } from '../Persistence/Repositories/typeorm-rag-document-relation.repository.js'
import { TypeOrmRagDocumentRevisionRepository } from '../Persistence/Repositories/typeorm-rag-document-revision.repository.js'
import { TypeOrmRagDocumentRepository } from '../Persistence/Repositories/typeorm-rag-document.repository.js'
import { TypeOrmRagFailedJobRepository } from '../Persistence/Repositories/typeorm-rag-failed-job.repository.js'
import { TypeOrmRagJobClaimRepository } from '../Persistence/Repositories/typeorm-rag-job-claim.repository.js'
import { TypeOrmRagJobRepository } from '../Persistence/Repositories/typeorm-rag-job.repository.js'
import { TypeOrmRagKnowledgeBaseRepository } from '../Persistence/Repositories/typeorm-rag-knowledge-base.repository.js'
import { TypeOrmRagMembershipRepository } from '../Persistence/Repositories/typeorm-rag-membership.repository.js'
import { TypeOrmRagRepository } from '../Persistence/Repositories/typeorm-rag.repository.js'

const RAG_INDEX_PIPELINE_SETTINGS = Symbol('RAG_INDEX_PIPELINE_SETTINGS')

const pipelineSettings = (config: RagConfig): RagIndexPipelineSettings => ({
  embeddingModel: config.embeddingModel,
  embeddingDimensions: config.embeddingDimensions,
  chunkingModel: config.chunkingModel,
  chunkingProfile: MarkdownChunkFactory.chunkingProfile,
  embeddingProfile: `mean-pooling-normalized:${config.embeddingDimensions}`,
  lexicalProfile: LEXICAL_PROFILE_VERSION,
  relationProfile: MarkdownChunkFactory.relationProfile,
})

const entities = [
  RagKnowledgeBaseModel,
  RagMembershipModel,
  RagDocumentModel,
  RagDocumentRevisionModel,
  RagDocumentIndexModel,
  RagChunkModel,
  RagDocumentRelationModel,
  RagJobModel,
  RagFailedJobModel,
]
@Module({
  imports: [
    RagConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [RagConfigModule],
      inject: [RAG_CONFIG],
      useFactory: (config: RagConfig) => ({
        type: 'postgres' as const,
        url: config.databaseUrl,
        schema: config.databaseSchema,
        entities,
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  providers: [
    RagServiceAuthenticator,
    NodeRagCryptographyAdapter,
    TypeOrmRagDocumentIndexRepository,
    TypeOrmRagChunkRepository,
    TypeOrmRagDocumentRelationRepository,
    TypeOrmRagDocumentRepository,
    TypeOrmRagDocumentRevisionRepository,
    TypeOrmRagJobRepository,
    TypeOrmRagJobClaimRepository,
    TypeOrmRagFailedJobRepository,
    TypeOrmRagKnowledgeBaseRepository,
    TypeOrmRagMembershipRepository,
    TypeOrmRagRepository,
    HttpEmbeddingClient,
    HttpChunkPlanningClient,
    PersistenceRagLexicalSearchFormatter,
    { provide: ChunkPlanningProvider, useExisting: HttpChunkPlanningClient },
    { provide: EmbeddingProvider, useExisting: HttpEmbeddingClient },
    { provide: RagLexicalSearchFormatter, useExisting: PersistenceRagLexicalSearchFormatter },
    { provide: RagCryptographyProvider, useExisting: NodeRagCryptographyAdapter },
    {
      provide: RAG_INDEX_PIPELINE_SETTINGS,
      useFactory: pipelineSettings,
      inject: [RAG_CONFIG],
    },
    {
      provide: RagIndexRequestAssembler,
      useFactory: (settings: RagIndexPipelineSettings) => new RagIndexRequestAssembler(settings),
      inject: [RAG_INDEX_PIPELINE_SETTINGS],
    },
    { provide: RagServiceAuthenticatorPort, useExisting: RagServiceAuthenticator },
    { provide: RagJobClaimTransactionBoundary, useExisting: TypeOrmRagRepository },
    { provide: RagIndexRequestTransactionRepository, useExisting: TypeOrmRagRepository },
    { provide: RagIndexCompletionTransactionRepository, useExisting: TypeOrmRagRepository },
    { provide: RagIndexChunkReplacementStore, useExisting: TypeOrmRagRepository },
    { provide: RagIndexProcessingRepository, useExisting: TypeOrmRagRepository },
    { provide: RagJobFailureStore, useExisting: TypeOrmRagRepository },
    { provide: RagRetrievalStore, useExisting: TypeOrmRagRepository },
    { provide: RagJobStatusReader, useExisting: TypeOrmRagRepository },
    { provide: RagFailedJobRetryStore, useExisting: TypeOrmRagRepository },
    { provide: RagMembershipPruningStore, useExisting: TypeOrmRagRepository },
    { provide: RagGarbageCollectionStore, useExisting: TypeOrmRagRepository },
    {
      provide: ClaimNextRagJobUseCase,
      useFactory: (
        claimBoundary: RagJobClaimTransactionBoundary,
        cryptography: RagCryptographyProvider,
        config: RagConfig,
      ) => new ClaimNextRagJobUseCase(claimBoundary, cryptography, config.workerLeaseSeconds),
      inject: [RagJobClaimTransactionBoundary, RagCryptographyProvider, RAG_CONFIG],
    },
    {
      provide: CompleteRagIndexJobUseCase,
      useFactory: (transactions: RagIndexCompletionTransactionRepository) =>
        new CompleteRagIndexJobUseCase(transactions),
      inject: [RagIndexCompletionTransactionRepository],
    },
    {
      provide: ReplaceIndexChunkUseCase,
      useFactory: (store: RagIndexChunkReplacementStore) => new ReplaceIndexChunkUseCase(store),
      inject: [RagIndexChunkReplacementStore],
    },
    {
      provide: FailRagIndexJobUseCase,
      useFactory: (store: RagJobFailureStore) => new FailRagIndexJobUseCase(store),
      inject: [RagJobFailureStore],
    },
    {
      provide: ProcessRagIndexJobUseCase,
      useFactory: (
        workflow: RagIndexProcessingRepository,
        replaceIndexPlan: ReplaceIndexChunkUseCase,
        completeIndexJob: CompleteRagIndexJobUseCase,
        claimNextJob: ClaimNextRagJobUseCase,
        failIndexJob: FailRagIndexJobUseCase,
        embeddings: EmbeddingProvider,
        chunkPlanner: ChunkPlanningProvider,
        lexicalFormatter: RagLexicalSearchFormatter,
        config: RagConfig,
      ) =>
        new ProcessRagIndexJobUseCase(
          workflow,
          replaceIndexPlan,
          completeIndexJob,
          claimNextJob,
          failIndexJob,
          embeddings,
          chunkPlanner,
          lexicalFormatter,
          config.workerLeaseSeconds,
        ),
      inject: [
        RagIndexProcessingRepository,
        ReplaceIndexChunkUseCase,
        CompleteRagIndexJobUseCase,
        ClaimNextRagJobUseCase,
        FailRagIndexJobUseCase,
        EmbeddingProvider,
        ChunkPlanningProvider,
        RagLexicalSearchFormatter,
        RAG_CONFIG,
      ],
    },
    {
      provide: CollectRagGarbageUseCase,
      useFactory: (indexes: RagGarbageCollectionStore, config: RagConfig) =>
        new CollectRagGarbageUseCase(indexes, config),
      inject: [RagGarbageCollectionStore, RAG_CONFIG],
    },
    {
      provide: RequestRagIndexUseCase,
      useFactory: (
        workflow: RagIndexRequestTransactionRepository,
        cryptography: RagCryptographyProvider,
        settings: RagIndexPipelineSettings,
        assembler: RagIndexRequestAssembler,
      ) => new RequestRagIndexUseCase(workflow, cryptography, settings, assembler),
      inject: [
        RagIndexRequestTransactionRepository,
        RagCryptographyProvider,
        RAG_INDEX_PIPELINE_SETTINGS,
        RagIndexRequestAssembler,
      ],
    },
    {
      provide: RetrieveRagUseCase,
      useFactory: (
        store: RagRetrievalStore,
        embeddings: EmbeddingProvider,
        lexicalFormatter: RagLexicalSearchFormatter,
        settings: RagIndexPipelineSettings,
      ) => new RetrieveRagUseCase(store, embeddings, lexicalFormatter, settings),
      inject: [RagRetrievalStore, EmbeddingProvider, RagLexicalSearchFormatter, RAG_INDEX_PIPELINE_SETTINGS],
    },
    {
      provide: GetRagJobStatusUseCase,
      useFactory: (rag: RagJobStatusReader) => new GetRagJobStatusUseCase(rag),
      inject: [RagJobStatusReader],
    },
    {
      provide: RetryFailedRagJobUseCase,
      useFactory: (
        failedJobs: RagFailedJobRetryStore,
        embeddings: EmbeddingProvider,
        cryptography: RagCryptographyProvider,
        config: RagConfig,
        assembler: RagIndexRequestAssembler,
      ) => new RetryFailedRagJobUseCase(failedJobs, embeddings, cryptography, config, assembler),
      inject: [
        RagFailedJobRetryStore,
        EmbeddingProvider,
        RagCryptographyProvider,
        RAG_CONFIG,
        RagIndexRequestAssembler,
      ],
    },
    {
      provide: PruneRagMembershipsUseCase,
      useFactory: (memberships: RagMembershipPruningStore) => new PruneRagMembershipsUseCase(memberships),
      inject: [RagMembershipPruningStore],
    },
  ],
  exports: [
    RagServiceAuthenticatorPort,
    TypeOrmRagRepository,
    RagIndexRequestTransactionRepository,
    RagIndexChunkReplacementStore,
    RagIndexProcessingRepository,
    RagJobFailureStore,
    RagRetrievalStore,
    RagJobStatusReader,
    RagFailedJobRetryStore,
    RagMembershipPruningStore,
    RagGarbageCollectionStore,
    EmbeddingProvider,
    ChunkPlanningProvider,
    RagLexicalSearchFormatter,
    ReplaceIndexChunkUseCase,
    ProcessRagIndexJobUseCase,
    FailRagIndexJobUseCase,
    ClaimNextRagJobUseCase,
    CollectRagGarbageUseCase,
    RequestRagIndexUseCase,
    RetrieveRagUseCase,
    GetRagJobStatusUseCase,
    RetryFailedRagJobUseCase,
    PruneRagMembershipsUseCase,
  ],
})
export class RagInfrastructureModule {}
