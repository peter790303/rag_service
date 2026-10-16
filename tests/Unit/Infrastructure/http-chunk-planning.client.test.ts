import assert from 'node:assert/strict'
import test from 'node:test'

import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { ChunkPlanningUnavailableException } from '../../../src/Application/Chunks/Exceptions/chunk-planning-unavailable.exception.ts'
import { mapChunkPlanningResponse } from '../../../src/Infrastructure/External/ChunkPlanning/Adapters/chunk-planning-response.adapter.ts'
import { MarkdownSourceAdapter } from '../../../src/Infrastructure/External/ChunkPlanning/Adapters/markdown-source.adapter.ts'
import { HttpChunkPlanningClient } from '../../../src/Infrastructure/External/ChunkPlanning/http-chunk-planning.client.ts'

const chunkPlanningClient = (apiKey?: string) =>
  new HttpChunkPlanningClient({
    chunkingModel: 'gpt-6.1-sol',
    chunkingApiUrl: 'https://model.example/v1/chat/completions',
    ...(apiKey ? { chunkingApiKey: apiKey } : {}),
  } satisfies Pick<KnowledgeServiceConfig, 'chunkingModel' | 'chunkingApiUrl' | 'chunkingApiKey'>)

const createChunkPlanningResponse = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })

const isChunkPlanningRecord = (responseRecordCandidate: unknown): responseRecordCandidate is Record<string, unknown> =>
  typeof responseRecordCandidate === 'object' &&
  responseRecordCandidate !== null &&
  !Array.isArray(responseRecordCandidate)

test('semantic planner preserves source text and accepts complete ordered block coverage', async () => {
  const source = '# Guide\r\n\r\nA complete paragraph.\r\n\r\n- one\r\n- two\r\n'
  const sourceBlocks = MarkdownSourceAdapter.scan(source).blocks
  assert.ok(sourceBlocks.length > 1)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_input, init) => {
    assert.equal(_input, 'https://model.example/v1/chat/completions')
    assert.equal(init?.method, 'POST')
    assert.equal(new Headers(init?.headers).get('authorization'), null)
    const request: unknown = JSON.parse(String(init?.body))
    assert.ok(isChunkPlanningRecord(request))
    assert.equal(request.model, 'gpt-6.1-sol')
    assert.ok(Array.isArray(request.messages))
    const messages: unknown[] = request.messages
    assert.deepEqual(
      messages.map((message) => {
        assert.ok(isChunkPlanningRecord(message))

        return message.role
      }),
      ['system', 'user'],
    )
    const userMessage = messages[1]
    assert.ok(isChunkPlanningRecord(userMessage))
    assert.ok(typeof userMessage.content === 'string')
    const submitted: unknown = JSON.parse(userMessage.content)
    assert.deepEqual(submitted, {
      blocks: sourceBlocks.map((block) => ({ id: 'block-' + block.id, content: block.text })),
    })

    return createChunkPlanningResponse(
      JSON.stringify({ chunkStarts: ['block-' + sourceBlocks[0]?.id, 'block-' + sourceBlocks[1]?.id] }),
    )
  }
  try {
    const plan = await chunkPlanningClient().plan(source)

    assert.deepEqual(
      plan.chunks.map((chunk) => chunk.content),
      [source.slice(0, sourceBlocks[1]?.startOffset), source.slice(sourceBlocks[1]?.startOffset)],
    )
    assert.equal(plan.chunks.map((chunk) => chunk.content).join(''), source)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('semantic planner maps a configured API key onto the outbound request', async (context) => {
  let authorization: string | null = null
  context.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    authorization = new Headers(init?.headers).get('authorization')

    return createChunkPlanningResponse('{"chunkStarts":["block-0"]}')
  })

  await chunkPlanningClient('secret-token').plan('A complete paragraph.')

  assert.equal(authorization, 'Bearer secret-token')
})

test('semantic planner rejects unknown or incomplete model boundaries without local fallback', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => createChunkPlanningResponse('{"chunkStarts":["unknown"]}')
  try {
    await assert.rejects(chunkPlanningClient().plan('A complete paragraph.'), ChunkPlanningUnavailableException)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('semantic planner maps non-success HTTP and malformed responses to the domain failure', async (context) => {
  const invalidResponses = [
    new Response('unavailable', { status: 503 }),
    new Response('{', { status: 200 }),
    new Response(JSON.stringify([]), { status: 200 }),
    new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    new Response(JSON.stringify({ choices: [[]] }), { status: 200 }),
    new Response(JSON.stringify({ choices: [{ message: [] }] }), { status: 200 }),
    createChunkPlanningResponse('not-json'),
    createChunkPlanningResponse('[]'),
    createChunkPlanningResponse('{}'),
    createChunkPlanningResponse('{"chunkStarts":[]}'),
    createChunkPlanningResponse('{"chunkStarts":["block-0","block-2","block-1"]}'),
    createChunkPlanningResponse('{"chunkStarts":["block-0","block-0"]}'),
    createChunkPlanningResponse('{"chunkStarts":["block-0",4]}'),
  ]

  await invalidResponses.reduce(async (previousRequest, response) => {
    await previousRequest
    context.mock.method(globalThis, 'fetch', async () => response)

    await assert.rejects(
      chunkPlanningClient().plan('A complete paragraph.\n\nAnother paragraph.\n\nLast paragraph.'),
      ChunkPlanningUnavailableException,
    )

    context.mock.reset()
  }, Promise.resolve())
})

test('semantic planner skips the external service when source has no blocks', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch should not be called for empty source')
  })

  assert.deepEqual(await chunkPlanningClient().plan(''), { chunks: [], relations: [] })
})

test('semantic planner bounds requests and maps timeout aborts to a domain failure', async (context) => {
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

  await assert.rejects(chunkPlanningClient().plan('A complete paragraph.'), ChunkPlanningUnavailableException)

  assert.equal(timeoutMs, 30_000)
  assert.equal(requestSignal, timeoutSignal)
})

test('semantic planner preserves network failures as the domain failure cause', async (context) => {
  const cause = new TypeError('provider unavailable')
  context.mock.method(globalThis, 'fetch', async () => {
    throw cause
  })
  await assert.rejects(chunkPlanningClient().plan('A complete paragraph.'), (error: unknown) => {
    assert.ok(error instanceof ChunkPlanningUnavailableException)
    assert.equal(error.cause, cause)

    return true
  })
})

test('semantic planner preserves response JSON failures as the domain failure cause', async (context) => {
  const cause = new SyntaxError('invalid provider JSON')
  const response = new Response('invalid')
  context.mock.method(response, 'json', async () => {
    throw cause
  })
  context.mock.method(globalThis, 'fetch', async () => response)
  await assert.rejects(chunkPlanningClient().plan('A complete paragraph.'), (error: unknown) => {
    assert.ok(error instanceof ChunkPlanningUnavailableException)
    assert.equal(error.cause, cause)

    return true
  })
})

test('chunk response adapter preserves assistant JSON failures as the domain failure cause', (context) => {
  const cause = new SyntaxError('invalid assistant JSON')
  const source = 'A complete paragraph.'
  const sourceScan = MarkdownSourceAdapter.scan(source)
  context.mock.method(JSON, 'parse', () => {
    throw cause
  })
  assert.throws(
    () => mapChunkPlanningResponse({ choices: [{ message: { content: 'invalid' } }] }, source, sourceScan),
    (error: unknown) => {
      assert.ok(error instanceof ChunkPlanningUnavailableException)
      assert.equal(error.cause, cause)

      return true
    },
  )
})
