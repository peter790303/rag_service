import assert from 'node:assert/strict'
import test from 'node:test'

import { loadKnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { ServiceConfigurationException } from '../../../src/Application/KnowledgeBases/Exceptions/service-configuration.exception.ts'

const validEnvironment = {
  RAG_DATABASE_URL: 'postgres://localhost:5432/rag_service',
  RAG_EMBEDDING_TRANSPORT: 'http',
  RAG_EMBEDDING_API_URL: 'https://embedding.example.test/v1/embeddings',
  RAG_CHUNKING_TRANSPORT: 'http',
  RAG_CHUNKING_API_URL: 'http://chunking.example.test/v1/chunks',
  RAG_SERVICE_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
}

test('RAG config accepts HTTP and HTTPS API URLs', () => {
  const config = loadKnowledgeServiceConfig(validEnvironment)

  assert.equal(config.embeddingApiUrl, validEnvironment.RAG_EMBEDDING_API_URL)
  assert.equal(config.chunkingApiUrl, validEnvironment.RAG_CHUNKING_API_URL)
  assert.equal(config.externalRequestTimeoutMs, 30000)
})

test('RAG config reads the external request timeout', () => {
  const config = loadKnowledgeServiceConfig({ ...validEnvironment, RAG_EXTERNAL_REQUEST_TIMEOUT_MS: '45000' })

  assert.equal(config.externalRequestTimeoutMs, 45000)
})

test('RAG config rejects invalid external request timeouts', (context) => {
  context.mock.method(console, 'error', () => {})

  assert.throws(
    () => loadKnowledgeServiceConfig({ ...validEnvironment, RAG_EXTERNAL_REQUEST_TIMEOUT_MS: '0' }),
    ServiceConfigurationException,
  )
  assert.throws(
    () => loadKnowledgeServiceConfig({ ...validEnvironment, RAG_EXTERNAL_REQUEST_TIMEOUT_MS: '1.5' }),
    ServiceConfigurationException,
  )
})

test('RAG config rejects API URLs with protocols unsupported by fetch callers', (context) => {
  context.mock.method(console, 'error', () => {})

  assert.throws(
    () =>
      loadKnowledgeServiceConfig({ ...validEnvironment, RAG_EMBEDDING_API_URL: 'ftp://embedding.example.test/model' }),
    ServiceConfigurationException,
  )
  assert.throws(
    () =>
      loadKnowledgeServiceConfig({ ...validEnvironment, RAG_CHUNKING_API_URL: 'ftp://chunking.example.test/model' }),
    ServiceConfigurationException,
  )
})

test('RAG config defaults to host CLI without requiring a chunk URL', () => {
  const config = loadKnowledgeServiceConfig({
    ...validEnvironment,
    RAG_CHUNKING_TRANSPORT: undefined,
    RAG_CHUNKING_API_URL: '',
  })
  assert.equal(config.chunkingTransport, 'host-cli')
  assert.equal(config.chunkingCliPath, 'codex')
  assert.equal(config.chunkingModel, 'gpt-6.1-sol')
  assert.equal(config.chunkingApiUrl, '')
})

test('RAG config accepts explicit CLI settings and rejects invalid transport and bounds', (context) => {
  context.mock.method(console, 'error', () => {})
  const config = loadKnowledgeServiceConfig({
    ...validEnvironment,
    RAG_CHUNKING_TRANSPORT: 'host-cli',
    RAG_CHUNKING_CLI_PATH: '/host/codex',
    RAG_CHUNKING_CLI_MAX_OUTPUT_BYTES: '1024',
  })
  assert.equal(config.chunkingCliPath, '/host/codex')
  assert.equal(config.chunkingCliMaxOutputBytes, 1024)
  assert.throws(
    () => loadKnowledgeServiceConfig({ ...validEnvironment, RAG_CHUNKING_TRANSPORT: 'other' }),
    ServiceConfigurationException,
  )
  assert.throws(
    () => loadKnowledgeServiceConfig({ ...validEnvironment, RAG_CHUNKING_CLI_MAX_OUTPUT_BYTES: '0' }),
    ServiceConfigurationException,
  )
  assert.throws(
    () => loadKnowledgeServiceConfig({ ...validEnvironment, RAG_CHUNKING_API_URL: '' }),
    ServiceConfigurationException,
  )
})

test('RAG config defaults to original local embedding without an HTTP URL', () => {
  const config = loadKnowledgeServiceConfig({
    ...validEnvironment,
    RAG_EMBEDDING_TRANSPORT: undefined,
    RAG_EMBEDDING_API_URL: '',
  })
  assert.equal(config.embeddingTransport, 'local')
  assert.equal(config.embeddingModel, 'Xenova/paraphrase-multilingual-MiniLM-L12-v2')
  assert.equal(config.embeddingRevision, '2c4055b12046f11709e9df2c122e59ffbdc2f900')
  assert.equal(config.embeddingDimensions, 384)
  assert.ok(config.embeddingCacheDir.endsWith('/.cache/embeddings'))
})

test('RAG local embedding requires a custom revision and safe cache identifiers', (context) => {
  context.mock.method(console, 'error', () => {})
  assert.throws(
    () =>
      loadKnowledgeServiceConfig({
        ...validEnvironment,
        RAG_EMBEDDING_TRANSPORT: 'local',
        RAG_EMBEDDING_MODEL: 'custom/model',
      }),
    ServiceConfigurationException,
  )
  assert.throws(
    () =>
      loadKnowledgeServiceConfig({
        ...validEnvironment,
        RAG_EMBEDDING_TRANSPORT: 'local',
        RAG_EMBEDDING_MODEL: '../model',
        RAG_EMBEDDING_REVISION: 'sha',
      }),
    ServiceConfigurationException,
  )
  assert.throws(
    () => loadKnowledgeServiceConfig({ ...validEnvironment, RAG_EMBEDDING_TRANSPORT: 'unknown' }),
    ServiceConfigurationException,
  )
  assert.throws(
    () => loadKnowledgeServiceConfig({ ...validEnvironment, RAG_EMBEDDING_API_URL: '' }),
    ServiceConfigurationException,
  )
  const config = loadKnowledgeServiceConfig({
    ...validEnvironment,
    RAG_EMBEDDING_TRANSPORT: 'local',
    RAG_EMBEDDING_MODEL: 'custom/model',
    RAG_EMBEDDING_REVISION: 'explicit-sha',
    RAG_EMBEDDING_CACHE_DIR: '/cache',
  })
  assert.equal(config.embeddingRevision, 'explicit-sha')
  assert.equal(config.embeddingCacheDir, '/cache')
})
