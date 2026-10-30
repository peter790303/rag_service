import assert from 'node:assert/strict'
import test from 'node:test'

import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { HttpEmbeddingClient } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/http-embedding.client.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/KnowledgeBases/Application/Exceptions/knowledge-embedding-unavailable.exception.ts'

const config = {
  embeddingApiUrl: 'https://embedding.example.test/v1/embeddings',
  embeddingModel: 'test-model',
  embeddingDimensions: 2,
  externalRequestTimeoutMs: 12_345,
} satisfies Pick<
  KnowledgeServiceConfig,
  'embeddingApiUrl' | 'embeddingModel' | 'embeddingDimensions' | 'externalRequestTimeoutMs'
>

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
  const cause = new TypeError('private endpoint')
  context.mock.method(globalThis, 'fetch', async () => Promise.reject(cause))

  await assert.rejects(new HttpEmbeddingClient(config).embed(['question']), (error: unknown) => {
    assertEmbeddingUnavailable(error)
    assert.ok(error instanceof KnowledgeEmbeddingUnavailableException)
    assert.equal(error.cause, cause)

    return true
  })
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

  assert.equal(timeoutMs, config.externalRequestTimeoutMs)
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

test('embedding client preserves the response JSON failure as its cause', async (context) => {
  const cause = new SyntaxError('invalid provider JSON')
  const response = new Response('invalid')
  context.mock.method(response, 'json', async () => {
    throw cause
  })
  context.mock.method(globalThis, 'fetch', async () => response)

  await assert.rejects(new HttpEmbeddingClient(config).embed(['question']), (error: unknown) => {
    assertEmbeddingUnavailable(error)
    assert.ok(error instanceof KnowledgeEmbeddingUnavailableException)
    assert.equal(error.cause, cause)

    return true
  })
})

test('HTTP embedding honors caller cancellation in addition to its request timeout', async (context) => {
  const controller = new AbortController()
  let requestSignal: AbortSignal | null | undefined
  context.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal
    controller.abort()
    throw new DOMException('aborted', 'AbortError')
  })
  await assert.rejects(new HttpEmbeddingClient(config).embed(['text'], controller.signal), assertEmbeddingUnavailable)
  assert.equal(requestSignal?.aborted, true)
})
