import assert from 'node:assert/strict'
import test from 'node:test'

import { Module } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants.js'
import { NestFactory } from '@nestjs/core'
import { getDataSourceToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { KNOWLEDGE_SERVICE_CONFIG } from '../../../config/knowledge-service.config.ts'
import { AppModule } from '../../../src/app.module.ts'
import { ChunkPlanningProvider } from '../../../src/Application/Chunks/Contracts/chunk-planning-provider.ts'
import { DocumentIndexExecutionQueue } from '../../../src/Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import { DispatchDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/dispatch-document-indexing.listener.ts'
import { DocumentIndexingRequestedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexing-requested.listener.ts'
import { ProcessDocumentIndexListener } from '../../../src/Application/DocumentIndexes/Listeners/process-document-index.listener.ts'
import { ReadDocumentIndexingStatusListener } from '../../../src/Application/DocumentIndexes/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/retry-document-indexing.listener.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../src/Application/Documents/Listeners/document-garbage-collection-requested.listener.ts'
import { PruneKnowledgeBaseDocumentsUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/prune-knowledge-base-documents.use-case.ts'
import { EmbeddingProvider } from '../../../src/Application/KnowledgeBases/Contracts/embedding-provider.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../src/Application/KnowledgeBases/Contracts/persistence-transaction.ts'
import { ServiceAuthenticator } from '../../../src/Application/KnowledgeBases/Contracts/service-authenticator.ts'
import { RetrieveKnowledgeBaseContentUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-knowledge-base-content.use-case.ts'
import { HmacProjectServiceAuthenticator } from '../../../src/Infrastructure/Auth/hmac-project-service.authenticator.ts'
import { HttpChunkPlanningClient } from '../../../src/Infrastructure/External/ChunkPlanning/http-chunk-planning.client.ts'
import { HttpEmbeddingClient } from '../../../src/Infrastructure/External/Embedding/http-embedding.client.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { JobRepository } from '../../../src/Infrastructure/Persistence/Repositories/job.repository.ts'
import { KnowledgeMaintenanceWorkerModule } from '../../../src/Infrastructure/Providers/knowledge-maintenance-worker.module.ts'
import { KnowledgeServiceConfigModule } from '../../../src/Infrastructure/Providers/knowledge-service-config.module.ts'
import { KnowledgeServiceInfrastructureModule } from '../../../src/Infrastructure/Providers/knowledge-service-infrastructure.module.ts'
import { RETRIEVAL_READONLY_DATA_SOURCE } from '../../../src/Infrastructure/Providers/retrieval-readonly-data-source.options.ts'
import { KnowledgeMaintenanceWorker } from '../../../src/Interfaces/Console/Workers/knowledge-maintenance-worker.ts'
import { DocumentIndexesController } from '../../../src/Interfaces/Http/Controllers/document-indexes.controller.ts'
import { KnowledgeBaseDocumentsController } from '../../../src/Interfaces/Http/Controllers/knowledge-base-documents.controller.ts'
import { KnowledgeBaseRetrievalController } from '../../../src/Interfaces/Http/Controllers/knowledge-base-retrieval.controller.ts'
import { ProjectServiceAuthGuard } from '../../../src/Interfaces/Http/Middleware/project-service-auth.guard.ts'
import { createKnowledgeServiceConfigFixture } from '../../Support/knowledge-service-config.fixture.ts'

@Module({ imports: [AppModule, KnowledgeMaintenanceWorkerModule] })
class BootstrapSmokeModule {}

test('HTTP and worker modules resolve their real feature graph with one writable and one readonly connection', async (context) => {
  const config = createKnowledgeServiceConfigFixture()
  const originalConfigProviders: unknown = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, KnowledgeServiceConfigModule)
  Reflect.defineMetadata(
    MODULE_METADATA.PROVIDERS,
    [{ provide: KNOWLEDGE_SERVICE_CONFIG, useValue: config }],
    KnowledgeServiceConfigModule,
  )
  const connections: DataSource[] = []
  const closedConnections: DataSource[] = []
  context.mock.method(DataSource.prototype, 'initialize', async function (this: DataSource) {
    connections.push(this)
    Object.defineProperty(this, 'isInitialized', { value: true, configurable: true })

    return this
  })
  context.mock.method(DataSource.prototype, 'destroy', async function (this: DataSource) {
    closedConnections.push(this)
    Object.defineProperty(this, 'isInitialized', { value: false, configurable: true })
  })
  // Resolve the actual worker dependencies without starting its background loops.
  context.mock.method(KnowledgeMaintenanceWorker.prototype, 'onModuleInit', () => undefined)
  try {
    assert.equal(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, KnowledgeServiceInfrastructureModule), undefined)
    const application = await NestFactory.createApplicationContext(BootstrapSmokeModule, {
      logger: false,
      abortOnError: false,
    })
    try {
      const httpTokens = [
        DocumentIndexingRequestedListener,
        RetrieveKnowledgeBaseContentUseCase,
        ReadDocumentIndexingStatusListener,
        RetryDocumentIndexingListener,
        PruneKnowledgeBaseDocumentsUseCase,
        ServiceAuthenticator,
      ]
      const workerTokens = [
        DocumentGarbageCollectionRequestedListener,
        DispatchDocumentIndexingListener,
        ProcessDocumentIndexListener,
        KnowledgeMaintenanceWorker,
      ]
      const interfaceTokens = [
        DocumentIndexesController,
        KnowledgeBaseRetrievalController,
        KnowledgeBaseDocumentsController,
        ProjectServiceAuthGuard,
      ]
      ;[...httpTokens, ...workerTokens, ...interfaceTokens].forEach((token) => assert.ok(application.get(token)))
      assert.equal(application.get(KNOWLEDGE_SERVICE_CONFIG), config)
      assert.equal(application.get(ServiceAuthenticator), application.get(HmacProjectServiceAuthenticator))
      assert.equal(application.get(EmbeddingProvider), application.get(HttpEmbeddingClient))
      assert.equal(application.get(ChunkPlanningProvider), application.get(HttpChunkPlanningClient))
      const jobRepository = application.get(JobRepository)
      assert.equal(application.get(DocumentIndexExecutionQueue), jobRepository)
      assert.equal(new Set(application.get(JobRepository, { each: true })).size, 1)
      const transaction = application.get(PersistenceTransaction)
      assert.equal(application.get(PersistenceTransactionContract), transaction)
      assert.equal(new Set(application.get(PersistenceTransaction, { each: true })).size, 1)
      const writable = application.get<DataSource>(getDataSourceToken())
      const readonly = application.get<DataSource>(getDataSourceToken(RETRIEVAL_READONLY_DATA_SOURCE))
      assert.notEqual(writable, readonly)
      assert.equal(transaction.manager, writable.manager)
      assert.deepEqual(new Set(connections), new Set([writable, readonly]))
      assert.equal(connections.length, 2)
      assert.equal(new Set(application.get<DataSource>(getDataSourceToken(), { each: true })).size, 1)
      assert.equal(
        new Set(application.get<DataSource>(getDataSourceToken(RETRIEVAL_READONLY_DATA_SOURCE), { each: true })).size,
        1,
      )
      assert.equal(await transaction.bind(readonly.manager, async () => transaction.manager), readonly.manager)
    } finally {
      await application.close()
    }
    assert.deepEqual(new Set(closedConnections), new Set(connections))
  } finally {
    Reflect.defineMetadata(MODULE_METADATA.PROVIDERS, originalConfigProviders, KnowledgeServiceConfigModule)
  }
})
