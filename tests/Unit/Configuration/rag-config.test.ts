import assert from 'node:assert/strict'
import test from 'node:test'

import { loadRagConfig } from '../../../config/rag.config.js'
import { RagConfigurationException } from '../../../src/Domain/Knowledge/Exceptions/rag-configuration.exception.js'

const validEnvironment = {
  RAG_DATABASE_URL: 'postgres://localhost:5432/rag_service',
  RAG_EMBEDDING_API_URL: 'https://embedding.example.test/v1/embeddings',
  RAG_CHUNKING_API_URL: 'http://chunking.example.test/v1/chunks',
  RAG_SERVICE_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
}

test('RAG config accepts HTTP and HTTPS API URLs', () => {
  const config = loadRagConfig(validEnvironment)

  assert.equal(config.embeddingApiUrl, validEnvironment.RAG_EMBEDDING_API_URL)
  assert.equal(config.chunkingApiUrl, validEnvironment.RAG_CHUNKING_API_URL)
})

test('RAG config rejects API URLs with protocols unsupported by fetch callers', (context) => {
  context.mock.method(console, 'error', () => {})

  assert.throws(
    () => loadRagConfig({ ...validEnvironment, RAG_EMBEDDING_API_URL: 'ftp://embedding.example.test/model' }),
    RagConfigurationException,
  )
  assert.throws(
    () => loadRagConfig({ ...validEnvironment, RAG_CHUNKING_API_URL: 'ftp://chunking.example.test/model' }),
    RagConfigurationException,
  )
})
