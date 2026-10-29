import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createHostCliBridgeServer,
  HOST_CLI_BRIDGE_ROUTE,
} from '../../../src/Infrastructure/External/ChunkPlanning/host-cli-bridge.server.ts'
import { HostCliChunkPlanningClient } from '../../../src/Infrastructure/External/ChunkPlanning/host-cli-chunk-planning.client.ts'

const secret = 'unit-test-shared-secret-with-at-least-32-characters'
const source = '# Title\n\nFirst paragraph.\n\nSecond paragraph.\n'

const withBridge = async <T>(
  executor: Parameters<typeof createHostCliBridgeServer>[1],
  run: (url: string) => Promise<T>,
): Promise<T> => {
  const bridge = createHostCliBridgeServer(
    {
      host: '127.0.0.1',
      port: 0,
      sharedSecret: secret,
      executable: '/configured/codex',
      model: 'gpt-6.1-sol',
      timeoutMs: 1000,
      maxOutputBytes: 65536,
    },
    executor,
  )
  bridge.server.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => bridge.server.once('listening', resolve))
  const address = bridge.server.address()
  assert.ok(address && typeof address !== 'string')

  try {
    return await run(`http://127.0.0.1:${address.port}${HOST_CLI_BRIDGE_ROUTE}`)
  } finally {
    await bridge.close()
  }
}

test('host CLI bridge supports the configured client protocol and server-owned execution settings', async () => {
  let received: Parameters<NonNullable<Parameters<typeof createHostCliBridgeServer>[1]>>[0] | undefined
  await withBridge(
    async (options) => {
      received = options

      return JSON.stringify({ chunkStarts: ['block-0'] })
    },
    async (url) => {
      const client = new HostCliChunkPlanningClient({
        chunkingCliPath: '/unused/client-cli',
        chunkingModel: 'gpt-6.1-sol',
        chunkingCliMaxOutputBytes: 65536,
        externalRequestTimeoutMs: 1000,
        hostCliUrl: url,
        hostCliSharedSecret: secret,
      })
      const result = await client.plan(source)

      assert.equal(result.chunks.map((chunk) => chunk.content).join(''), source)
      assert.equal(received?.executable, '/configured/codex')
      assert.equal(received?.model, 'gpt-6.1-sol')
      assert.ok(received?.prompt.includes('First paragraph.'))
      assert.equal(received?.timeoutMs, 1000)
      assert.equal(received?.maxOutputBytes, 65536)
    },
  )
})

test('host CLI bridge rejects unauthorized and mismatched model requests without executing Codex', async () => {
  let executions = 0
  await withBridge(
    async () => {
      executions += 1

      return ''
    },
    async (url) => {
      const unauthorized = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer wrong' },
        body: JSON.stringify({ source, model: 'gpt-6.1-sol' }),
      })
      assert.equal(unauthorized.status, 401)

      const mismatch = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ source, model: 'different-model' }),
      })
      assert.equal(mismatch.status, 409)
      assert.equal(executions, 0)
    },
  )
})

test('host CLI bridge allows only one active CLI process and aborts it on client disconnect', async () => {
  let started!: () => void
  const executionStarted = new Promise<void>((resolve) => (started = resolve))
  let wasAborted = false
  let markAborted!: () => void
  const aborted = new Promise<void>((resolve) => (markAborted = resolve))
  let release!: () => void
  const executor = async ({ signal }: { signal?: AbortSignal }): Promise<string> => {
    started()

    await new Promise<void>((resolve) => {
      release = resolve
      signal?.addEventListener(
        'abort',
        () => {
          wasAborted = true
          markAborted()
          resolve()
        },
        { once: true },
      )
    })

    return JSON.stringify({ chunkStarts: ['block-0'] })
  }

  await withBridge(executor, async (url) => {
    const controller = new AbortController()
    const pending = fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ source, model: 'gpt-6.1-sol' }),
      signal: controller.signal,
    })
    await executionStarted

    const busy = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ source, model: 'gpt-6.1-sol' }),
    })
    assert.equal(busy.status, 503)

    controller.abort()
    await assert.rejects(pending)
    await Promise.race([aborted, new Promise<void>((resolve) => setTimeout(resolve, 500))])
    assert.equal(wasAborted, true)
  })

  release?.()
})

test('host CLI bridge close waits for the active CLI execution to settle', async () => {
  let started!: () => void
  const executionStarted = new Promise<void>((resolve) => (started = resolve))
  let aborted!: () => void
  const executionAborted = new Promise<void>((resolve) => (aborted = resolve))
  let release!: () => void
  const bridge = createHostCliBridgeServer(
    {
      host: '127.0.0.1',
      port: 0,
      sharedSecret: secret,
      executable: '/configured/codex',
      model: 'gpt-6.1-sol',
      timeoutMs: 1000,
      maxOutputBytes: 65536,
    },
    async ({ signal }) => {
      started()
      signal?.addEventListener('abort', aborted, { once: true })
      await new Promise<void>((resolve) => (release = resolve))

      return ''
    },
  )
  bridge.server.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => bridge.server.once('listening', resolve))
  const address = bridge.server.address()
  assert.ok(address && typeof address !== 'string')

  const request = fetch(`http://127.0.0.1:${address.port}${HOST_CLI_BRIDGE_ROUTE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify({ source, model: 'gpt-6.1-sol' }),
  })
  await executionStarted

  let closeSettled = false
  const closing = bridge.close().then(() => (closeSettled = true))
  await executionAborted
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(closeSettled, false)

  release()
  await closing
  await assert.rejects(request)
})
