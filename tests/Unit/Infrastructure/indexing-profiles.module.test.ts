import assert from 'node:assert/strict'
import test from 'node:test'

import { MODULE_METADATA } from '@nestjs/common/constants.js'
import { NestFactory } from '@nestjs/core'

import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import type { DocumentIndexPipelineSettings } from '../../../src/Application/DocumentIndexes/Assemblers/write-request-document-indexes.assembler.ts'
import { EmbeddingProvider } from '../../../src/Application/KnowledgeBases/Contracts/embedding-provider.ts'
import { HttpEmbeddingClient } from '../../../src/Infrastructure/External/Embedding/http-embedding.client.ts'
import { LocalEmbeddingClient } from '../../../src/Infrastructure/External/Embedding/local-embedding.client.ts'
import {
  DOCUMENT_INDEX_PIPELINE_SETTINGS,
  IndexingProfilesModule,
} from '../../../src/Infrastructure/Providers/indexing-profiles.module.ts'
import { KnowledgeServiceConfigModule } from '../../../src/Infrastructure/Providers/knowledge-service-config.module.ts'
import { createKnowledgeServiceConfigFixture } from '../../Support/knowledge-service-config.fixture.ts'

const resolveIdentity = async (config: KnowledgeServiceConfig): Promise<void> => {
  const originalProviders: unknown = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, KnowledgeServiceConfigModule)
  Reflect.defineMetadata(
    MODULE_METADATA.PROVIDERS,
    [{ provide: KNOWLEDGE_SERVICE_CONFIG, useValue: config }],
    KnowledgeServiceConfigModule,
  )
  try {
    const application = await NestFactory.createApplicationContext(IndexingProfilesModule, {
      logger: false,
      abortOnError: false,
    })
    try {
      const provider = application.get(EmbeddingProvider)
      const settings = application.get<DocumentIndexPipelineSettings>(DOCUMENT_INDEX_PIPELINE_SETTINGS)
      assert.equal(settings.embeddingModel, provider.modelId)
      assert.equal(settings.embeddingDimensions, config.embeddingDimensions)

      if (config.embeddingTransport === 'local') {
        assert.ok(provider instanceof LocalEmbeddingClient)
        assert.equal(
          settings.embeddingModel,
          `${config.embeddingModel}@${config.embeddingRevision}:cpu:q8:mean:normalize:full-text-v1`,
        )
        assert.notEqual(settings.embeddingModel, config.embeddingModel)
      } else {
        assert.ok(provider instanceof HttpEmbeddingClient)
        assert.equal(settings.embeddingModel, config.embeddingModel)
      }
    } finally {
      await application.close()
    }
  } finally {
    Reflect.defineMetadata(MODULE_METADATA.PROVIDERS, originalProviders, KnowledgeServiceConfigModule)
  }
}

test('local indexing settings and retrieval share the actual canonical embedding identity without inference', async () => {
  await resolveIdentity(
    createKnowledgeServiceConfigFixture({ embeddingTransport: 'local', embeddingRevision: 'pinned' }),
  )
})

test('HTTP indexing settings preserve the existing provider identity', async () => {
  await resolveIdentity(createKnowledgeServiceConfigFixture())
})
