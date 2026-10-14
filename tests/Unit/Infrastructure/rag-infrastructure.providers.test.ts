import assert from 'node:assert/strict'
import test from 'node:test'

import { Module, type ExistingProvider, type FactoryProvider } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants.js'
import { NestFactory } from '@nestjs/core'

import { RAG_CONFIG, type RagConfig } from '../../../config/rag.config.js'
import { ChunkPlanningProvider } from '../../../src/Application/KnowledgeBases/Contracts/chunk-planning-provider.js'
import { EmbeddingProvider } from '../../../src/Application/KnowledgeBases/Contracts/embedding-provider.js'
import { RagCryptographyProvider } from '../../../src/Application/KnowledgeBases/Contracts/rag-cryptography-provider.js'
import { RagIndexChunkReplacementStore } from '../../../src/Application/KnowledgeBases/Contracts/rag-index-chunk-replacement-store.js'
import { RagIndexCompletionTransactionRepository } from '../../../src/Application/KnowledgeBases/Contracts/rag-index-completion-transaction.js'
import { RagIndexRequestTransactionRepository } from '../../../src/Application/KnowledgeBases/Contracts/rag-index-request-transaction.js'
import {
  RagIndexProcessingRepository,
  RagJobFailureStore,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-indexing-repository.js'
import { RagJobClaimTransactionBoundary } from '../../../src/Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'
import {
  RagFailedJobRetryStore,
  RagJobStatusReader,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-job-management.js'
import { RagLexicalSearchFormatter } from '../../../src/Application/KnowledgeBases/Contracts/rag-lexical-search-formatter.js'
import {
  RagGarbageCollectionStore,
  RagMembershipPruningStore,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-retention-store.js'
import { RagRetrievalStore } from '../../../src/Application/KnowledgeBases/Contracts/rag-retrieval-store.js'
import { RagServiceAuthenticatorPort } from '../../../src/Application/KnowledgeBases/Contracts/rag-service-authenticator.js'
import { ClaimNextRagJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/claim-next-rag-job.use-case.js'
import { CollectRagGarbageUseCase } from '../../../src/Application/KnowledgeBases/UseCases/collect-rag-garbage.use-case.js'
import { CompleteRagIndexJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/complete-rag-index-job.use-case.js'
import { FailRagIndexJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/fail-rag-index-job.use-case.js'
import { GetRagJobStatusUseCase } from '../../../src/Application/KnowledgeBases/UseCases/get-rag-job-status.use-case.js'
import { ProcessRagIndexJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/process-rag-index-job.use-case.js'
import { PruneRagMembershipsUseCase } from '../../../src/Application/KnowledgeBases/UseCases/prune-rag-memberships.use-case.js'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/KnowledgeBases/UseCases/replace-index-chunk.use-case.js'
import { RequestRagIndexUseCase } from '../../../src/Application/KnowledgeBases/UseCases/request-rag-index.use-case.js'
import { RetrieveRagUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-rag.use-case.js'
import { RetryFailedRagJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retry-failed-rag-job.use-case.js'
import { RagServiceAuthenticator } from '../../../src/Infrastructure/Auth/rag-service-authenticator.js'
import { HttpChunkPlanningClient } from '../../../src/Infrastructure/External/ChunkPlanning/http-chunk-planning.client.js'
import { NodeRagCryptographyAdapter } from '../../../src/Infrastructure/External/Cryptography/Adapter/node-rag-cryptography.adapter.js'
import { HttpEmbeddingClient } from '../../../src/Infrastructure/External/Embedding/http-embedding.client.js'
import {
  LEXICAL_PROFILE_VERSION,
  PersistenceRagLexicalSearchFormatter,
} from '../../../src/Infrastructure/Persistence/Formatters/rag-lexical-search.formatter.js'
import { TypeOrmRagJobClaimRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-job-claim.repository.js'
import { TypeOrmRagRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag.repository.js'
import { RagInfrastructureModule } from '../../../src/Infrastructure/Providers/rag-infrastructure.module.js'

const config: RagConfig = {
  port: 30700,
  databaseUrl: 'postgresql://unused@localhost/unused',
  databaseSchema: 'public',
  embeddingModel: 'test-model',
  embeddingDimensions: 2,
  embeddingApiUrl: 'https://embedding.example.test',
  chunkingModel: 'test-chunker',
  chunkingApiUrl: 'https://chunking.example.test',
  workerPollMs: 1000,
  gcPollMs: 1000,
  gcRetentionMs: 1000,
  workerLeaseSeconds: 300,
  serviceAuthSecret: 'test-secret-long-enough-for-config',
}

const isCompositionProvider = (value: unknown): value is ExistingProvider | FactoryProvider => {
  if (typeof value !== 'object' || value === null || !('provide' in value)) return false

  return 'useExisting' in value || ('useFactory' in value && typeof value.useFactory === 'function')
}

test('infrastructure composition resolves Application ports and all use-case factories', async () => {
  const registeredProviders: unknown = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RagInfrastructureModule)
  assert.ok(Array.isArray(registeredProviders))
  const infrastructureImplementations = [
    RagServiceAuthenticator,
    NodeRagCryptographyAdapter,
    HttpEmbeddingClient,
    HttpChunkPlanningClient,
    PersistenceRagLexicalSearchFormatter,
  ]
  assert.ok(infrastructureImplementations.every((implementation) => registeredProviders.includes(implementation)))
  const persistence = {}
  const claimPersistence = {}
  class CompositionSmokeModule {}
  Module({
    providers: [
      ...registeredProviders.filter(isCompositionProvider),
      ...infrastructureImplementations,
      { provide: RAG_CONFIG, useValue: config },
      { provide: TypeOrmRagRepository, useValue: persistence },
      { provide: TypeOrmRagJobClaimRepository, useValue: claimPersistence },
    ],
  })(CompositionSmokeModule)
  const context = await NestFactory.createApplicationContext(CompositionSmokeModule, {
    logger: false,
    abortOnError: false,
  })
  try {
    const persistencePorts = [
      RagJobClaimTransactionBoundary,
      RagIndexRequestTransactionRepository,
      RagIndexCompletionTransactionRepository,
      RagIndexChunkReplacementStore,
      RagIndexProcessingRepository,
      RagJobFailureStore,
      RagRetrievalStore,
      RagJobStatusReader,
      RagFailedJobRetryStore,
      RagMembershipPruningStore,
      RagGarbageCollectionStore,
    ]
    persistencePorts.forEach((port) => assert.equal(context.get(port), persistence))
    assert.equal(context.get(RagServiceAuthenticatorPort), context.get(RagServiceAuthenticator))
    assert.equal(context.get(RagCryptographyProvider), context.get(NodeRagCryptographyAdapter))
    assert.equal(context.get(EmbeddingProvider), context.get(HttpEmbeddingClient))
    assert.equal(context.get(ChunkPlanningProvider), context.get(HttpChunkPlanningClient))
    const lexicalFormatter = context.get<RagLexicalSearchFormatter>(RagLexicalSearchFormatter)
    assert.ok(lexicalFormatter instanceof PersistenceRagLexicalSearchFormatter)
    assert.deepEqual(lexicalFormatter.format('Hello, RAG!'), {
      profileVersion: LEXICAL_PROFILE_VERSION,
      terms: ['hello', 'rag'],
      searchText: 'hello rag',
    })
    const useCaseTokens = [
      ClaimNextRagJobUseCase,
      CollectRagGarbageUseCase,
      CompleteRagIndexJobUseCase,
      FailRagIndexJobUseCase,
      GetRagJobStatusUseCase,
      ProcessRagIndexJobUseCase,
      PruneRagMembershipsUseCase,
      ReplaceIndexChunkUseCase,
      RequestRagIndexUseCase,
      RetrieveRagUseCase,
      RetryFailedRagJobUseCase,
    ]
    assert.ok(useCaseTokens.every((token) => context.get(token) instanceof token))
  } finally {
    await context.close()
  }
})
