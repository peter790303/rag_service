import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { RagConfigModule } from './rag-config.module.js'
import { RAG_CONFIG, type RagConfig } from '../../../config/rag.config.js'
import { ChunkPlanningProvider } from '../../Application/KnowledgeBases/Contracts/chunk-planning-provider.js'
import { EmbeddingProvider } from '../../Application/KnowledgeBases/Contracts/embedding-provider.js'
import { CollectRagGarbageUseCase } from '../../Application/KnowledgeBases/UseCases/collect-rag-garbage.use-case.js'
import { GetRagJobStatusUseCase } from '../../Application/KnowledgeBases/UseCases/get-rag-job-status.use-case.js'
import { ProcessRagIndexJobUseCase } from '../../Application/KnowledgeBases/UseCases/process-rag-index-job.use-case.js'
import { PruneRagMembershipsUseCase } from '../../Application/KnowledgeBases/UseCases/prune-rag-memberships.use-case.js'
import { RequestRagIndexUseCase } from '../../Application/KnowledgeBases/UseCases/request-rag-index.use-case.js'
import { RetrieveRagUseCase } from '../../Application/KnowledgeBases/UseCases/retrieve-rag.use-case.js'
import { RetryFailedRagJobUseCase } from '../../Application/KnowledgeBases/UseCases/retry-failed-rag-job.use-case.js'
import { RagServiceAuthGuard } from '../../Interfaces/Http/Middleware/rag-service-auth.guard.js'
import { RagServiceAuthenticator } from '../Auth/rag-service-authenticator.js'
import { HttpChunkPlanningAdapter } from '../External/ChunkPlanning/Adapter/http-chunk-planning.adapter.js'
import { HttpEmbeddingAdapter } from '../External/Embedding/Adapter/http-embedding.adapter.js'
import { RagChunkModel } from '../Persistence/Models/rag-chunk.model.js'
import { RagDocumentIndexModel } from '../Persistence/Models/rag-document-index.model.js'
import { RagDocumentRelationModel } from '../Persistence/Models/rag-document-relation.model.js'
import { RagDocumentRevisionModel } from '../Persistence/Models/rag-document-revision.model.js'
import { RagDocumentModel } from '../Persistence/Models/rag-document.model.js'
import { RagFailedJobModel } from '../Persistence/Models/rag-failed-job.model.js'
import { RagJobModel } from '../Persistence/Models/rag-job.model.js'
import { RagKnowledgeBaseModel } from '../Persistence/Models/rag-knowledge-base.model.js'
import { RagMembershipModel } from '../Persistence/Models/rag-membership.model.js'
import { RagIndexingStore } from '../Persistence/Repositories/Contracts/rag-indexing-store.js'
import { RagFailedJobRetryStore, RagJobStatusReader } from '../Persistence/Repositories/Contracts/rag-job-management.js'
import {
  RagGarbageCollectionStore,
  RagMembershipPruningStore,
} from '../Persistence/Repositories/Contracts/rag-retention-store.js'
import { RagRetrievalStore } from '../Persistence/Repositories/Contracts/rag-retrieval-store.js'
import { TypeOrmRagChunkRepository } from '../Persistence/Repositories/typeorm-rag-chunk.repository.js'
import { TypeOrmRagDocumentIndexRepository } from '../Persistence/Repositories/typeorm-rag-document-index.repository.js'
import { TypeOrmRagDocumentRelationRepository } from '../Persistence/Repositories/typeorm-rag-document-relation.repository.js'
import { TypeOrmRagDocumentRevisionRepository } from '../Persistence/Repositories/typeorm-rag-document-revision.repository.js'
import { TypeOrmRagDocumentRepository } from '../Persistence/Repositories/typeorm-rag-document.repository.js'
import { TypeOrmRagFailedJobRepository } from '../Persistence/Repositories/typeorm-rag-failed-job.repository.js'
import { TypeOrmRagJobRepository } from '../Persistence/Repositories/typeorm-rag-job.repository.js'
import { TypeOrmRagKnowledgeBaseRepository } from '../Persistence/Repositories/typeorm-rag-knowledge-base.repository.js'
import { TypeOrmRagMembershipRepository } from '../Persistence/Repositories/typeorm-rag-membership.repository.js'
import { TypeOrmRagRepository } from '../Persistence/Repositories/typeorm-rag.repository.js'

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
    RagServiceAuthGuard,
    RagServiceAuthenticator,
    TypeOrmRagDocumentIndexRepository,
    TypeOrmRagChunkRepository,
    TypeOrmRagDocumentRelationRepository,
    TypeOrmRagDocumentRepository,
    TypeOrmRagDocumentRevisionRepository,
    TypeOrmRagJobRepository,
    TypeOrmRagFailedJobRepository,
    TypeOrmRagKnowledgeBaseRepository,
    TypeOrmRagMembershipRepository,
    TypeOrmRagRepository,
    HttpEmbeddingAdapter,
    HttpChunkPlanningAdapter,
    { provide: ChunkPlanningProvider, useExisting: HttpChunkPlanningAdapter },
    { provide: EmbeddingProvider, useExisting: HttpEmbeddingAdapter },
    { provide: RagIndexingStore, useExisting: TypeOrmRagRepository },
    { provide: RagRetrievalStore, useExisting: TypeOrmRagRepository },
    { provide: RagJobStatusReader, useExisting: TypeOrmRagRepository },
    { provide: RagFailedJobRetryStore, useExisting: TypeOrmRagRepository },
    { provide: RagMembershipPruningStore, useExisting: TypeOrmRagRepository },
    { provide: RagGarbageCollectionStore, useExisting: TypeOrmRagRepository },
    {
      provide: ProcessRagIndexJobUseCase,
      useFactory: (store: RagIndexingStore, embeddings: EmbeddingProvider, chunkPlanner: ChunkPlanningProvider) =>
        new ProcessRagIndexJobUseCase(store, embeddings, chunkPlanner),
      inject: [RagIndexingStore, EmbeddingProvider, ChunkPlanningProvider],
    },
    {
      provide: CollectRagGarbageUseCase,
      useFactory: (indexes: RagGarbageCollectionStore, config: RagConfig) =>
        new CollectRagGarbageUseCase(indexes, config),
      inject: [RagGarbageCollectionStore, RAG_CONFIG],
    },
    {
      provide: RequestRagIndexUseCase,
      useFactory: (store: RagIndexingStore) => new RequestRagIndexUseCase(store),
      inject: [RagIndexingStore],
    },
    {
      provide: RetrieveRagUseCase,
      useFactory: (store: RagRetrievalStore, embeddings: EmbeddingProvider) =>
        new RetrieveRagUseCase(store, embeddings),
      inject: [RagRetrievalStore, EmbeddingProvider],
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
        config: RagConfig,
        requestIndex: RequestRagIndexUseCase,
      ) => new RetryFailedRagJobUseCase(failedJobs, embeddings, config, requestIndex),
      inject: [RagFailedJobRetryStore, EmbeddingProvider, RAG_CONFIG, RequestRagIndexUseCase],
    },
    {
      provide: PruneRagMembershipsUseCase,
      useFactory: (memberships: RagMembershipPruningStore) => new PruneRagMembershipsUseCase(memberships),
      inject: [RagMembershipPruningStore],
    },
  ],
  exports: [
    RagServiceAuthGuard,
    TypeOrmRagRepository,
    RagIndexingStore,
    RagRetrievalStore,
    RagJobStatusReader,
    RagFailedJobRetryStore,
    RagMembershipPruningStore,
    RagGarbageCollectionStore,
    EmbeddingProvider,
    ChunkPlanningProvider,
    ProcessRagIndexJobUseCase,
    CollectRagGarbageUseCase,
    RequestRagIndexUseCase,
    RetrieveRagUseCase,
    GetRagJobStatusUseCase,
    RetryFailedRagJobUseCase,
    PruneRagMembershipsUseCase,
  ],
})
export class RagInfrastructureModule {}
