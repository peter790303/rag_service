import { Inject, Injectable } from '@nestjs/common'

import { createChunkPlanningPrompt } from './Adapters/chunk-planning-request.adapter.ts'
import { mapChunkPlanningContent } from './Adapters/chunk-planning-response.adapter.ts'
import { MarkdownSourceAdapter } from './Adapters/markdown-source.adapter.ts'
import { executeHostCliChunkPlanning } from './host-cli-execution.ts'
import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import { ChunkPlanningProvider } from '../../../Application/Chunks/Contracts/chunk-planning-provider.ts'
import type { MarkdownChunkPlan } from '../../../Application/Chunks/DataTransferObjects/markdown-chunk-plan.dto.ts'
import { ChunkPlanningUnavailableException } from '../../../Application/Chunks/Exceptions/chunk-planning-unavailable.exception.ts'

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
    if (!this.chunkPlanningConfig.hostCliUrl || !this.chunkPlanningConfig.hostCliSharedSecret)
      throw new Error('Host CLI bridge configuration is incomplete')

    const timeoutSignal = AbortSignal.timeout(this.chunkPlanningConfig.externalRequestTimeoutMs)
    const requestSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal
    let response: Response

    try {
      response = await fetch(this.chunkPlanningConfig.hostCliUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.chunkPlanningConfig.hostCliSharedSecret}`,
        },
        body: JSON.stringify({ source, model: this.modelId }),
        signal: requestSignal,
      })

      if (!response.ok) throw new Error(`Host CLI returned HTTP ${response.status}`)

      const maxBytes = this.chunkPlanningConfig.chunkingCliMaxOutputBytes * 6 + 256
      const responseText = await this.readBoundedBody(response, maxBytes)
      const body: unknown = JSON.parse(responseText)

      if (typeof body !== 'object' || body === null || !('content' in body) || typeof body.content !== 'string')
        throw new Error('Host CLI returned an invalid response')

      if (Buffer.byteLength(body.content, 'utf8') > this.chunkPlanningConfig.chunkingCliMaxOutputBytes)
        throw new Error('Host CLI response exceeded the configured output limit')

      return body.content
    } catch (cause) {
      throw new ChunkPlanningUnavailableException({ cause })
    }
  }

  private async readBoundedBody(response: Response, maxBytes: number): Promise<string> {
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
    )

    return Buffer.concat(chunks).toString('utf8')
  }
}
