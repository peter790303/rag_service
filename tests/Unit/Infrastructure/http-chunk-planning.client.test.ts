import assert from 'node:assert/strict'
import test from 'node:test'

import type { RagConfig } from '../../../config/rag.config.js'
import { ChunkPlanningUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/chunk-planning-unavailable.exception.js'
import { MarkdownChunkFactory } from '../../../src/Domain/Knowledge/markdown-chunk.factory.js'
import { HttpChunkPlanningClient } from '../../../src/Infrastructure/External/ChunkPlanning/http-chunk-planning.client.js'

const client = (apiKey?: string) =>
  new HttpChunkPlanningClient({
    chunkingModel: 'gpt-6.1-sol',
    chunkingApiUrl: 'https://model.example/v1/chat/completions',
    ...(apiKey ? { chunkingApiKey: apiKey } : {}),
  } satisfies Pick<RagConfig, 'chunkingModel' | 'chunkingApiUrl' | 'chunkingApiKey'>)

const responseWith = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

test('semantic planner preserves source text and accepts complete ordered block coverage', async () => {
  const source = '# Guide\r\n\r\nA complete paragraph.\r\n\r\n- one\r\n- two\r\n'
  const sourceBlocks = MarkdownChunkFactory.scan(source)
  assert.ok(sourceBlocks.length > 1)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_input, init) => {
    assert.equal(_input, 'https://model.example/v1/chat/completions')
    assert.equal(init?.method, 'POST')
    assert.equal(new Headers(init?.headers).get('authorization'), null)
    const request: unknown = JSON.parse(String(init?.body))
    assert.ok(isRecord(request))
    assert.equal(request.model, 'gpt-6.1-sol')
    assert.ok(Array.isArray(request.messages))
    const messages: unknown[] = request.messages
    assert.deepEqual(
      messages.map((message) => {
        assert.ok(isRecord(message))

        return message.role
      }),
      ['system', 'user'],
    )
    const userMessage = messages[1]
    assert.ok(isRecord(userMessage))
    assert.ok(typeof userMessage.content === 'string')
    const submitted: unknown = JSON.parse(userMessage.content)
    assert.deepEqual(submitted, {
      blocks: sourceBlocks.map((block) => ({ id: 'block-' + block.id, content: block.text })),
    })

    return responseWith(
      JSON.stringify({ chunkStarts: ['block-' + sourceBlocks[0]?.id, 'block-' + sourceBlocks[1]?.id] }),
    )
  }
  try {
    const plan = await client().plan(source)

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

    return responseWith('{"chunkStarts":["block-0"]}')
  })

  await client('secret-token').plan('A complete paragraph.')

  assert.equal(authorization, 'Bearer secret-token')
})

test('semantic planner rejects unknown or incomplete model boundaries without local fallback', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => responseWith('{"chunkStarts":["unknown"]}')
  try {
    await assert.rejects(client().plan('A complete paragraph.'), ChunkPlanningUnavailableException)
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
    responseWith('not-json'),
    responseWith('[]'),
    responseWith('{}'),
    responseWith('{"chunkStarts":[]}'),
    responseWith('{"chunkStarts":["block-0","block-2","block-1"]}'),
    responseWith('{"chunkStarts":["block-0","block-0"]}'),
    responseWith('{"chunkStarts":["block-0",4]}'),
  ]

  await invalidResponses.reduce(async (previousRequest, response) => {
    await previousRequest
    context.mock.method(globalThis, 'fetch', async () => response)

    await assert.rejects(
      client().plan('A complete paragraph.\n\nAnother paragraph.\n\nLast paragraph.'),
      ChunkPlanningUnavailableException,
    )

    context.mock.reset()
  }, Promise.resolve())
})

test('semantic planner skips the external service when source has no blocks', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch should not be called for empty source')
  })

  assert.deepEqual(await client().plan(''), MarkdownChunkFactory.plan(''))
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

  await assert.rejects(client().plan('A complete paragraph.'), ChunkPlanningUnavailableException)

  assert.equal(timeoutMs, 30_000)
  assert.equal(requestSignal, timeoutSignal)
})
