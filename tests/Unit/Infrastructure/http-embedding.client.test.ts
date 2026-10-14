import assert from 'node:assert/strict'
import test from 'node:test'

import type { RagConfig } from '../../../config/rag.config.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { HttpEmbeddingClient } from '../../../src/Infrastructure/External/Embedding/http-embedding.client.js'

const config = {
  embeddingApiUrl: 'https://embedding.example.test/v1/embeddings',
  embeddingModel: 'test-model',
  embeddingDimensions: 2,
} satisfies Pick<RagConfig, 'embeddingApiUrl' | 'embeddingModel' | 'embeddingDimensions'>

const assertEmbeddingUnavailable = (error: unknown): boolean => {
  assert.ok(error instanceof KnowledgeEmbeddingUnavailableException)
  assert.deepEqual(
    { code: error.code, message: error.message },
    { code: 'KNOWLEDGE_EMBEDDING_UNAVAILABLE', message: 'Knowledge embedding is unavailable' },
  )

  return true
}

test('embedding client sends configured model and text order without optional authorization', async (context) => {
  let requestedUrl: RequestInfo | URL | undefined
  let requestedInit: RequestInit | undefined
  context.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = url
    requestedInit = init

    return Response.json({ data: [{ embedding: [1, 0] }, { embedding: [0, 1] }] })
  })
  const client = new HttpEmbeddingClient(config)
  const vectors = await client.embed(['first', 'second'])

  assert.equal(client.modelId, 'test-model')
  assert.equal(requestedUrl, config.embeddingApiUrl)
  assert.equal(requestedInit?.method, 'POST')
  assert.equal(new Headers(requestedInit?.headers).get('content-type'), 'application/json')
  assert.equal(new Headers(requestedInit?.headers).get('authorization'), null)
  assert.equal(requestedInit?.body, JSON.stringify({ model: 'test-model', input: ['first', 'second'] }))
  assert.deepEqual(vectors, [
    [1, 0],
    [0, 1],
  ])
})

test('embedding client sends configured bearer authorization', async (context) => {
  let authorization: string | null | undefined
  context.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    authorization = new Headers(init?.headers).get('authorization')

    return Response.json({ data: [{ embedding: [1, 0] }] })
  })

  await new HttpEmbeddingClient({ ...config, embeddingApiKey: 'provider-key' }).embed(['question'])

  assert.equal(authorization, 'Bearer provider-key')
})

test('embedding client maps network failures to knowledge availability', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Promise.reject(new TypeError('private endpoint')))

  await assert.rejects(new HttpEmbeddingClient(config).embed(['question']), assertEmbeddingUnavailable)
})

test('embedding client bounds requests and maps timeout aborts to knowledge availability', async (context) => {
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

  await assert.rejects(new HttpEmbeddingClient(config).embed(['question']), assertEmbeddingUnavailable)

  assert.equal(timeoutMs, 30_000)
  assert.equal(requestSignal, timeoutSignal)
})

test('embedding client hides upstream HTTP status from domain failures', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }))

  await assert.rejects(new HttpEmbeddingClient(config).embed(['question']), assertEmbeddingUnavailable)
})

test('embedding client rejects malformed vectors with a domain failure', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ data: [{ embedding: [1, 'invalid'] }] }))

  await assert.rejects(new HttpEmbeddingClient(config).embed(['question']), assertEmbeddingUnavailable)
})

test('embedding client maps invalid JSON to knowledge availability', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('not JSON'))

  await assert.rejects(new HttpEmbeddingClient(config).embed(['question']), assertEmbeddingUnavailable)
})

test('embedding client skips the provider for an empty input batch', async (context) => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({ data: [] }))

  assert.deepEqual(await new HttpEmbeddingClient(config).embed([]), [])
  assert.equal(fetchMock.mock.callCount(), 0)
})
