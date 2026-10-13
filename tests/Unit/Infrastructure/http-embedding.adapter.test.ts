import assert from 'node:assert/strict'
import test from 'node:test'

import type { RagConfig } from '../../../config/rag.config.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { HttpEmbeddingAdapter } from '../../../src/Infrastructure/External/Embedding/Adapter/http-embedding.adapter.js'

const config = {
  embeddingApiUrl: 'https://embedding.example.test/v1/embeddings',
  embeddingModel: 'test-model',
  embeddingDimensions: 2,
} as RagConfig

const assertEmbeddingUnavailable = (error: unknown): boolean => {
  assert.ok(error instanceof KnowledgeEmbeddingUnavailableException)
  assert.deepEqual(
    { code: error.code, message: error.message },
    { code: 'KNOWLEDGE_EMBEDDING_UNAVAILABLE', message: 'Knowledge embedding is unavailable' },
  )

  return true
}

test('embedding adapter maps network failures to knowledge availability', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Promise.reject(new TypeError('private endpoint')))

  await assert.rejects(new HttpEmbeddingAdapter(config).embed(['question']), assertEmbeddingUnavailable)
})

test('embedding adapter bounds requests and maps timeout aborts to knowledge availability', async (context) => {
  const timeoutSignal = AbortSignal.abort()
  let timeoutMs: number | undefined
  let requestSignal: AbortSignal | null | undefined
  context.mock.method(AbortSignal, 'timeout', (delay: number) => {
    timeoutMs = delay

    return timeoutSignal
  })
  context.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal
    throw new DOMException('request timed out', 'TimeoutError')
  })

  await assert.rejects(new HttpEmbeddingAdapter(config).embed(['question']), assertEmbeddingUnavailable)

  assert.equal(timeoutMs, 30_000)
  assert.equal(requestSignal, timeoutSignal)
})

test('embedding adapter hides upstream HTTP status from domain failures', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }))

  await assert.rejects(new HttpEmbeddingAdapter(config).embed(['question']), assertEmbeddingUnavailable)
})

test('embedding adapter rejects malformed vectors with a domain failure', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ data: [{ embedding: [1, 'invalid'] }] }))

  await assert.rejects(new HttpEmbeddingAdapter(config).embed(['question']), assertEmbeddingUnavailable)
})
