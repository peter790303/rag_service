import { Inject, Injectable } from '@nestjs/common'

import { createChunkPlanningPrompt } from './Adapters/chunk-planning-request.adapter.ts'
import { mapChunkPlanningContent } from './Adapters/chunk-planning-response.adapter.ts'
import { MarkdownSourceAdapter } from './Adapters/markdown-source.adapter.ts'
import { executeHostCliChunkPlanning } from './host-cli-execution.ts'
import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import { ChunkPlanningProvider } from '../../../Application/Chunks/Contracts/chunk-planning-provider.ts'
import type { MarkdownChunkPlan } from '../../../Application/Chunks/DataTransferObjects/markdown-chunk-plan.dto.ts'
import { ChunkPlanningUnavailableException } from '../../../Application/Chunks/Exceptions/chunk-planning-unavailable.exception.ts'

class HostCliBridgeFailure extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'HostCliBridgeFailure'
  }
}

interface HostCliRequestState {
  deadline: number
  timeoutSignal: AbortSignal
  requestSignal: AbortSignal
  callerSignal: AbortSignal | undefined
  waitingForCapacity: boolean
}

const knownBridgeFailureCodes = new Set([
  'HOST_CLI_EXECUTION_FAILED',
  'HOST_CLI_REQUEST_TIMED_OUT',
  'HOST_CLI_REQUEST_ABORTED',
  'HOST_CLI_OUTPUT_LIMIT_EXCEEDED',
  'HOST_CLI_TURN_INCOMPLETE',
])

@Injectable()
export class HostCliChunkPlanningClient extends ChunkPlanningProvider {
  constructor(
    @Inject(KNOWLEDGE_SERVICE_CONFIG)
    private readonly chunkPlanningConfig: Pick<
      KnowledgeServiceConfig,
      | 'chunkingModel'
      | 'chunkingCliPath'
      | 'chunkingCliMaxOutputBytes'
      | 'externalRequestTimeoutMs'
      | 'hostCliUrl'
      | 'hostCliSharedSecret'
    >,
  ) {
    super()
  }

  get modelId(): string {
    return this.chunkPlanningConfig.chunkingModel
  }

  async plan(source: string, signal?: AbortSignal): Promise<MarkdownChunkPlan> {
    const sourceScan = MarkdownSourceAdapter.scan(source)

    if (!sourceScan.blocks.length) return { chunks: [], relations: [] }

    try {
      const content = this.chunkPlanningConfig.hostCliUrl
        ? await this.requestHostCli(source, signal)
        : await executeHostCliChunkPlanning({
            executable: this.chunkPlanningConfig.chunkingCliPath,
            model: this.modelId,
            prompt: createChunkPlanningPrompt(sourceScan.blocks),
            timeoutMs: this.chunkPlanningConfig.externalRequestTimeoutMs,
            maxOutputBytes: this.chunkPlanningConfig.chunkingCliMaxOutputBytes,
            ...(signal ? { signal } : {}),
          })

      return mapChunkPlanningContent(content, source, sourceScan)
    } catch (cause) {
      if (cause instanceof ChunkPlanningUnavailableException) throw cause

      throw new ChunkPlanningUnavailableException({ cause })
    }
  }

  private async requestHostCli(source: string, signal?: AbortSignal): Promise<string> {
    const hostCliUrl = this.chunkPlanningConfig.hostCliUrl
    const hostCliSharedSecret = this.chunkPlanningConfig.hostCliSharedSecret

    if (!hostCliUrl || !hostCliSharedSecret) throw new Error('Host CLI bridge configuration is incomplete')

    const timeoutMs = this.chunkPlanningConfig.externalRequestTimeoutMs
    const deadline = Date.now() + timeoutMs
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const requestSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal
    try {
      const state = { deadline, timeoutSignal, requestSignal, callerSignal: signal, waitingForCapacity: false }
      const attemptCount = Math.ceil(timeoutMs / 100) + 1
      const content = await Array.from({ length: attemptCount }).reduce<Promise<string | undefined>>(
        (previous) =>
          previous.then((completedContent) =>
            completedContent === undefined
              ? this.requestOrWaitForCapacity(source, hostCliUrl, hostCliSharedSecret, state)
              : completedContent,
          ),
        Promise.resolve(undefined),
      )

      if (content !== undefined) return content

      throw new HostCliBridgeFailure(state.waitingForCapacity ? 'HOST_CLI_BUSY_TIMEOUT' : 'HOST_CLI_REQUEST_TIMED_OUT')
    } catch (cause) {
      if (cause instanceof ChunkPlanningUnavailableException) throw cause

      throw new ChunkPlanningUnavailableException({ cause })
    }
  }

  private async requestOrWaitForCapacity(
    source: string,
    hostCliUrl: string,
    hostCliSharedSecret: string,
    state: HostCliRequestState,
  ): Promise<string | undefined> {
    const result = await this.requestHostCliOnce(source, hostCliUrl, hostCliSharedSecret, state)

    if (result.content !== undefined) return result.content

    state.waitingForCapacity = true
    const remainingMs = state.deadline - Date.now()

    if (remainingMs <= 0) throw new HostCliBridgeFailure('HOST_CLI_BUSY_TIMEOUT')

    await this.waitBeforeRetry(Math.min(100 + Math.floor(Math.random() * 100), remainingMs), state.requestSignal, () =>
      this.abortFailure(state.callerSignal, state.timeoutSignal, state.waitingForCapacity),
    )

    return undefined
  }

  private async requestHostCliOnce(
    source: string,
    hostCliUrl: string,
    hostCliSharedSecret: string,
    state: HostCliRequestState,
  ): Promise<{ content: string } | { content: undefined }> {
    if (state.requestSignal.aborted)
      throw this.abortFailure(state.callerSignal, state.timeoutSignal, state.waitingForCapacity)

    let response: Response
    try {
      response = await fetch(hostCliUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${hostCliSharedSecret}`,
        },
        body: JSON.stringify({ source, model: this.modelId }),
        signal: state.requestSignal,
      })
    } catch {
      throw this.abortFailure(state.callerSignal, state.timeoutSignal, state.waitingForCapacity)
    }

    state.waitingForCapacity = false

    if (!response.ok) {
      const remoteCode = await this.readErrorCode(response, state.requestSignal)

      if (state.requestSignal.aborted)
        throw this.abortFailure(state.callerSignal, state.timeoutSignal, state.waitingForCapacity)

      if (response.status === 503 && remoteCode === 'HOST_CLI_BUSY') return { content: undefined }

      if ((response.status === 502 || response.status === 504) && remoteCode && knownBridgeFailureCodes.has(remoteCode))
        throw new HostCliBridgeFailure(remoteCode)

      throw new HostCliBridgeFailure(`HOST_CLI_HTTP_${response.status}`)
    }

    const maxBytes = this.chunkPlanningConfig.chunkingCliMaxOutputBytes * 6 + 256
    let responseText: string
    try {
      responseText = await this.readBoundedBody(response, maxBytes, state.requestSignal)
    } catch {
      if (state.requestSignal.aborted)
        throw this.abortFailure(state.callerSignal, state.timeoutSignal, state.waitingForCapacity)

      throw new HostCliBridgeFailure('HOST_CLI_OUTPUT_LIMIT_EXCEEDED')
    }

    let body: unknown
    try {
      body = JSON.parse(responseText)
    } catch {
      throw new HostCliBridgeFailure('HOST_CLI_INVALID_RESPONSE')
    }

    if (typeof body !== 'object' || body === null || !('content' in body) || typeof body.content !== 'string')
      throw new HostCliBridgeFailure('HOST_CLI_INVALID_RESPONSE')

    if (Buffer.byteLength(body.content, 'utf8') > this.chunkPlanningConfig.chunkingCliMaxOutputBytes)
      throw new HostCliBridgeFailure('HOST_CLI_OUTPUT_LIMIT_EXCEEDED')

    return { content: body.content }
  }

  private abortFailure(
    signal: AbortSignal | undefined,
    timeoutSignal: AbortSignal,
    waitingForCapacity: boolean,
  ): Error {
    if (signal?.aborted) return new HostCliBridgeFailure('HOST_CLI_REQUEST_ABORTED')

    if (timeoutSignal.aborted)
      return new HostCliBridgeFailure(waitingForCapacity ? 'HOST_CLI_BUSY_TIMEOUT' : 'HOST_CLI_REQUEST_TIMED_OUT')

    return new HostCliBridgeFailure('HOST_CLI_REQUEST_FAILED')
  }

  private async readErrorCode(response: Response, signal: AbortSignal): Promise<string | undefined> {
    try {
      const body: unknown = JSON.parse(await this.readBoundedBody(response, 1024, signal))

      return typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : undefined
    } catch {
      return undefined
    }
  }

  private waitBeforeRetry(delayMs: number, signal: AbortSignal, abortFailure: () => Error): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      }, delayMs)
      const abort = (): void => {
        clearTimeout(timer)
        reject(abortFailure())
      }
      signal.addEventListener('abort', abort, { once: true })
    })
  }

  private async readBoundedBody(response: Response, maxBytes: number, signal?: AbortSignal): Promise<string> {
    const contentLength = Number(response.headers.get('content-length'))

    if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error('Host CLI response is too large')

    if (!response.body) throw new Error('Host CLI response body is missing')

    const chunks: Buffer[] = []
    let totalBytes = 0

    await response.body.pipeTo(
      new WritableStream<Uint8Array>({
        write(value) {
          totalBytes += value.byteLength

          if (totalBytes > maxBytes) throw new Error('Host CLI response is too large')

          chunks.push(Buffer.from(value))
        },
      }),
      signal ? { signal } : undefined,
    )

    return Buffer.concat(chunks).toString('utf8')
  }
}
