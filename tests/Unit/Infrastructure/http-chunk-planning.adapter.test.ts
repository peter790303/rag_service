import assert from 'node:assert/strict'
import test from 'node:test'

import { ChunkPlanningUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/chunk-planning-unavailable.exception.js'
import { MarkdownChunkFactory } from '../../../src/Domain/Knowledge/markdown-chunk.factory.js'
import { HttpChunkPlanningAdapter } from '../../../src/Infrastructure/External/ChunkPlanning/Adapter/http-chunk-planning.adapter.js'

const adapter = () =>
  new HttpChunkPlanningAdapter({
    chunkingModel: 'gpt-6.1-sol',
    chunkingApiUrl: 'https://model.example/v1/chat/completions',
  } as never)

const responseWith = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })

test('semantic planner preserves source text and accepts complete ordered block coverage', async () => {
  const source = '# Guide\r\n\r\nA complete paragraph.\r\n\r\n- one\r\n- two\r\n'
  const sourceBlocks = MarkdownChunkFactory.scan(source)
  assert.ok(sourceBlocks.length > 1)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }
    const submitted = JSON.parse(request.messages[1]?.content ?? '') as {
      blocks: Array<{ id: string; content: string }>
    }
    assert.deepEqual(
      submitted.blocks,
      sourceBlocks.map((block) => ({ id: 'block-' + block.id, content: block.text })),
    )

    return responseWith(
      JSON.stringify({ chunkStarts: ['block-' + sourceBlocks[0]?.id, 'block-' + sourceBlocks[1]?.id] }),
    )
  }
  try {
    const plan = await adapter().plan(source)

    assert.deepEqual(
      plan.chunks.map((chunk) => chunk.content),
      [source.slice(0, sourceBlocks[1]?.startOffset), source.slice(sourceBlocks[1]?.startOffset)],
    )
    assert.equal(plan.chunks.map((chunk) => chunk.content).join(''), source)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('semantic planner rejects unknown or incomplete model boundaries without local fallback', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => responseWith('{"chunkStarts":["unknown"]}')
  try {
    await assert.rejects(adapter().plan('A complete paragraph.'), ChunkPlanningUnavailableException)
  } finally {
    globalThis.fetch = originalFetch
  }
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

  await assert.rejects(adapter().plan('A complete paragraph.'), ChunkPlanningUnavailableException)

  assert.equal(timeoutMs, 30_000)
  assert.equal(requestSignal, timeoutSignal)
})
