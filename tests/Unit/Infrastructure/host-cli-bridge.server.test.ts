import assert from 'node:assert/strict'
import test from 'node:test'

import { loadHostCliBridgeConfig } from '../../../config/host-cli-bridge.config.ts'
import {
  createHostCliBridgeServer,
  HOST_CLI_BRIDGE_ROUTE,
} from '../../../src/Chunks/Infrastructure/External/ChunkPlanning/host-cli-bridge.server.ts'
import { HostCliChunkPlanningClient } from '../../../src/Chunks/Infrastructure/External/ChunkPlanning/host-cli-chunk-planning.client.ts'

const secret = 'unit-test-shared-secret-with-at-least-32-characters'
const source = '# Title\n\nFirst paragraph.\n\nSecond paragraph.\n'
const hostClient = (url: string, timeout = 1500): HostCliChunkPlanningClient =>
  new HostCliChunkPlanningClient({
    chunkingCliPath: '/unused/client-cli',
    chunkingModel: 'gpt-6.1-sol',
    chunkingCliMaxOutputBytes: 65536,
    externalRequestTimeoutMs: timeout,
    hostCliUrl: url,
    hostCliSharedSecret: secret,
  })

test('host CLI bridge concurrency defaults to one and accepts only positive integers', () => {
  const env = { RAG_HOST_CLI_SHARED_SECRET: secret }
  assert.equal(loadHostCliBridgeConfig(env).maxConcurrency, 1)
  assert.equal(loadHostCliBridgeConfig({ ...env, RAG_HOST_CLI_MAX_CONCURRENCY: '4' }).maxConcurrency, 4)
  assert.throws(() => loadHostCliBridgeConfig({ ...env, RAG_HOST_CLI_MAX_CONCURRENCY: '0' }))
  assert.throws(() => loadHostCliBridgeConfig({ ...env, RAG_HOST_CLI_MAX_CONCURRENCY: '1.5' }))
})

const withBridge = async <T>(
  executor: Parameters<typeof createHostCliBridgeServer>[1],
  run: (url: string) => Promise<T>,
  maxConcurrency = 1,
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
      maxConcurrency,
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

      const unauthorizedClient = new HostCliChunkPlanningClient({
        chunkingCliPath: '/unused/client-cli',
        chunkingModel: 'gpt-6.1-sol',
        chunkingCliMaxOutputBytes: 65536,
        externalRequestTimeoutMs: 1000,
        hostCliUrl: url,
        hostCliSharedSecret: 'wrong-but-long-enough-shared-secret-value',
      })
      await assert.rejects(unauthorizedClient.plan(source), (error: unknown) => {
        assert.equal((error as { cause: { code: string } }).cause.code, 'HOST_CLI_HTTP_401')

        return true
      })

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
      maxConcurrency: 1,
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

test('host CLI bridge enforces the configured concurrency cap', async () => {
  let started = 0
  let active = 0
  let peak = 0
  let bothStartedResolve!: () => void
  const bothStarted = new Promise<void>((resolve) => (bothStartedResolve = resolve))
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))

  await withBridge(
    async () => {
      started += 1

      if (started === 2) bothStartedResolve()

      active += 1
      peak = Math.max(peak, active)
      await gate
      active -= 1

      return JSON.stringify({ chunkStarts: ['block-0'] })
    },
    async (url) => {
      const request = (): Promise<Response> =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
          body: JSON.stringify({ source, model: 'gpt-6.1-sol' }),
        })
      const first = request()
      const second = request()
      await bothStarted
      const busy = await request()
      assert.equal(busy.status, 503)
      assert.deepEqual(await busy.json(), { error: 'HOST_CLI_BUSY' })
      release()
      assert.equal((await first).status, 200)
      assert.equal((await second).status, 200)
      assert.equal(peak, 2)
    },
    2,
  )
})

test('host CLI client waits through explicit busy responses until the bridge is available', async () => {
  let firstStarted!: () => void
  const started = new Promise<void>((resolve) => (firstStarted = resolve))
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  let calls = 0

  await withBridge(
    async () => {
      calls += 1

      if (calls === 1) firstStarted()

      if (calls === 1) await gate

      return JSON.stringify({ chunkStarts: ['block-0'] })
    },
    async (url) => {
      const first = hostClient(url).plan(source)
      await started
      const second = hostClient(url).plan(source)
      await new Promise((resolve) => setTimeout(resolve, 250))
      release()
      const [firstResult, secondResult] = await Promise.all([first, second])
      assert.equal(firstResult.chunks.length, 1)
      assert.equal(secondResult.chunks.length, 1)
      assert.ok(calls >= 2)
    },
  )
})

test('host CLI client bounds waiting for busy and honors caller abort', async () => {
  let started!: () => void
  const executionStarted = new Promise<void>((resolve) => (started = resolve))
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))

  await withBridge(
    async () => {
      started()
      await gate

      return JSON.stringify({ chunkStarts: ['block-0'] })
    },
    async (url) => {
      const first = hostClient(url, 1500).plan(source)
      await executionStarted
      await assert.rejects(hostClient(url, 160).plan(source), (error: unknown) => {
        assert.equal((error as { cause: { code: string } }).cause.code, 'HOST_CLI_BUSY_TIMEOUT')

        return true
      })

      const controller = new AbortController()
      const aborted = hostClient(url, 1500).plan(source, controller.signal)
      await new Promise((resolve) => setTimeout(resolve, 60))
      controller.abort()
      await assert.rejects(aborted, (error: unknown) => {
        assert.equal((error as { cause: { code: string } }).cause.code, 'HOST_CLI_REQUEST_ABORTED')

        return true
      })
      release()
      await first
    },
  )
})

test('host CLI client does not retry non-busy bridge failures', async () => {
  let calls = 0
  await withBridge(
    async () => {
      calls += 1
      throw Object.assign(new Error('private executor details'), { code: 'HOST_CLI_EXECUTION_FAILED' })
    },
    async (url) => {
      await assert.rejects(hostClient(url).plan(source), (error: unknown) => {
        assert.equal((error as { cause: { code: string } }).cause.code, 'HOST_CLI_EXECUTION_FAILED')

        return true
      })
      assert.equal(calls, 1)
    },
  )
})

test('host CLI client reports request timeout when response body stalls after capacity is available', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  let accepted!: () => void
  const acceptedResponse = new Promise<void>((resolve) => (accepted = resolve))

  globalThis.fetch = async () => {
    calls += 1

    if (calls === 1)
      return new Response(JSON.stringify({ error: 'HOST_CLI_BUSY' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })

    accepted()

    return new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200 })
  }

  try {
    const request = hostClient('http://host-cli.test', 500).plan(source)
    await acceptedResponse
    await assert.rejects(request, (error: unknown) => {
      assert.equal((error as { cause: { code: string } }).cause.code, 'HOST_CLI_REQUEST_TIMED_OUT')

      return true
    })
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})
