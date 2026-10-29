import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { createChunkPlanningPrompt } from './Adapters/chunk-planning-request.adapter.ts'
import { MarkdownSourceAdapter } from './Adapters/markdown-source.adapter.ts'
import { executeHostCliChunkPlanning } from './host-cli-execution.ts'
import type { HostCliBridgeConfig } from '../../../../config/host-cli-bridge.config.ts'

const MAX_REQUEST_BYTES = 8 * 1024 * 1024
const ROUTE = '/internal/chunk-planning'

interface HostCliRequest {
  source: string
  model: string
}

type HostCliExecutor = (options: {
  executable: string
  model: string
  prompt: string
  timeoutMs: number
  maxOutputBytes: number
  signal?: AbortSignal
}) => Promise<string>

const send = (response: ServerResponse, status: number, body?: unknown): void => {
  const serialized = body === undefined ? '' : JSON.stringify(body)
  response.writeHead(status, {
    ...(serialized ? { 'content-type': 'application/json; charset=utf-8' } : {}),
    'content-length': Buffer.byteLength(serialized),
    'cache-control': 'no-store',
  })
  response.end(serialized)
}

const authorized = (request: IncomingMessage, secret: string): boolean => {
  const supplied = request.headers.authorization

  if (typeof supplied !== 'string' || !supplied.startsWith('Bearer ')) return false

  const actual = Buffer.from(supplied.slice('Bearer '.length))
  const expected = Buffer.from(secret)

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const parseRequest = (serialized: string): HostCliRequest => {
  const body: unknown = JSON.parse(serialized)

  if (
    typeof body !== 'object' ||
    body === null ||
    !('source' in body) ||
    typeof body.source !== 'string' ||
    !('model' in body) ||
    typeof body.model !== 'string'
  )
    throw new TypeError('INVALID_REQUEST')

  return { source: body.source, model: body.model }
}

const readRequest = (request: IncomingMessage): Promise<HostCliRequest> => {
  const contentLength = Number(request.headers['content-length'])

  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES)
    return Promise.reject(new RangeError('REQUEST_TOO_LARGE'))

  return new Promise<HostCliRequest>((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let tooLarge = false

    request.on('data', (chunk: Buffer | string) => {
      if (tooLarge) return

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      totalBytes += buffer.length

      if (totalBytes > MAX_REQUEST_BYTES) {
        tooLarge = true
        chunks.length = 0

        return
      }

      chunks.push(buffer)
    })
    request.once('error', reject)
    request.once('aborted', () => reject(new Error('REQUEST_ABORTED')))
    request.once('end', () => {
      if (tooLarge) {
        reject(new RangeError('REQUEST_TOO_LARGE'))

        return
      }

      try {
        resolve(parseRequest(Buffer.concat(chunks).toString('utf8')))
      } catch (cause) {
        reject(cause)
      }
    })
  })
}

const errorCode = (cause: unknown): string => {
  const knownCodes = new Set([
    'HOST_CLI_EXECUTION_FAILED',
    'HOST_CLI_REQUEST_TIMED_OUT',
    'HOST_CLI_REQUEST_ABORTED',
    'HOST_CLI_OUTPUT_LIMIT_EXCEEDED',
    'HOST_CLI_TURN_INCOMPLETE',
  ])

  if (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    typeof cause.code === 'string' &&
    knownCodes.has(cause.code)
  )
    return cause.code

  return 'HOST_CLI_FAILED'
}

/** Serves only bounded, authenticated requests that run the configured local Codex CLI. */
export const createHostCliBridgeServer = (
  config: HostCliBridgeConfig,
  executor: HostCliExecutor = executeHostCliChunkPlanning,
): { server: Server; close: () => Promise<void> } => {
  const activeExecutions = new Map<AbortController, Promise<string>>()
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== ROUTE) {
      send(response, 404, { error: 'NOT_FOUND' })

      return
    }

    if (!authorized(request, config.sharedSecret)) {
      request.resume()
      send(response, 401, { error: 'UNAUTHORIZED' })

      return
    }

    if (activeExecutions.size >= config.maxConcurrency) {
      request.resume()
      send(response, 503, { error: 'HOST_CLI_BUSY' })

      return
    }

    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      request.resume()
      send(response, 415, { error: 'UNSUPPORTED_MEDIA_TYPE' })

      return
    }

    let body: HostCliRequest
    try {
      body = await readRequest(request)
    } catch (cause) {
      request.resume()

      if (cause instanceof RangeError) send(response, 413, { error: 'REQUEST_TOO_LARGE' })
      else send(response, 400, { error: 'INVALID_REQUEST' })

      return
    }

    if (body.model !== config.model) {
      send(response, 409, { error: 'MODEL_MISMATCH' })

      return
    }

    const blocks = MarkdownSourceAdapter.scan(body.source).blocks

    if (!blocks.length) {
      send(response, 200, { content: JSON.stringify({ chunkStarts: [] }) })

      return
    }

    if (activeExecutions.size >= config.maxConcurrency) {
      send(response, 503, { error: 'HOST_CLI_BUSY' })

      return
    }

    const controller = new AbortController()
    activeExecutions.set(controller, Promise.resolve(''))
    request.on('aborted', () => controller.abort())
    response.on('close', () => {
      if (!response.writableEnded) controller.abort()
    })

    const execution = Promise.resolve().then(() =>
      executor({
        executable: config.executable,
        model: config.model,
        prompt: createChunkPlanningPrompt(blocks),
        timeoutMs: config.timeoutMs,
        maxOutputBytes: config.maxOutputBytes,
        signal: controller.signal,
      }),
    )
    activeExecutions.set(controller, execution)

    try {
      const content = await execution

      if (Buffer.byteLength(content, 'utf8') > config.maxOutputBytes) {
        const cause = Object.assign(new Error('CLI output exceeded the configured limit'), {
          code: 'HOST_CLI_OUTPUT_LIMIT_EXCEEDED',
        })
        throw cause
      }

      if (!controller.signal.aborted) send(response, 200, { content })
    } catch (cause) {
      if (!controller.signal.aborted) {
        const code = errorCode(cause)
        const status = code === 'HOST_CLI_REQUEST_TIMED_OUT' ? 504 : 502
        send(response, status, { error: code })
      }
    } finally {
      activeExecutions.delete(controller)
    }
  })

  return {
    server,
    close: async () => {
      Array.from(activeExecutions.keys()).forEach((controller) => controller.abort())
      const serverClosed = new Promise<void>((resolve, reject) => {
        server.close((cause) => (cause ? reject(cause) : resolve()))
        server.closeAllConnections()
      })
      await serverClosed
      await Promise.all(
        [...activeExecutions.values()].map((execution) =>
          execution.then(
            () => undefined,
            () => undefined,
          ),
        ),
      )
    },
  }
}

export { MAX_REQUEST_BYTES as HOST_CLI_BRIDGE_MAX_REQUEST_BYTES, ROUTE as HOST_CLI_BRIDGE_ROUTE }
