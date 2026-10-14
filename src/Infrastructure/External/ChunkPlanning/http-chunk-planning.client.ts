import { Inject, Injectable } from '@nestjs/common'

import { createChunkPlanningRequestBody } from './Adapter/chunk-planning-request.adapter.js'
import { mapChunkPlanningResponse } from './Adapter/chunk-planning-response.adapter.js'
import { RAG_CONFIG, type RagConfig } from '../../../../config/rag.config.js'
import { ChunkPlanningProvider } from '../../../Application/KnowledgeBases/Contracts/chunk-planning-provider.js'
import { ChunkPlanningUnavailableException } from '../../../Domain/Knowledge/Exceptions/chunk-planning-unavailable.exception.js'
import { MarkdownChunkFactory, type MarkdownPlan } from '../../../Domain/Knowledge/markdown-chunk.factory.js'

const EXTERNAL_REQUEST_TIMEOUT_MS = 30_000

@Injectable()
export class HttpChunkPlanningClient extends ChunkPlanningProvider {
  constructor(
    @Inject(RAG_CONFIG)
    private readonly config: Pick<RagConfig, 'chunkingModel' | 'chunkingApiUrl' | 'chunkingApiKey'>,
  ) {
    super()
  }

  get modelId(): string {
    return this.config.chunkingModel
  }

  async plan(source: string): Promise<MarkdownPlan> {
    const sourceBlocks = MarkdownChunkFactory.scan(source)

    if (!sourceBlocks.length) return MarkdownChunkFactory.plan(source)

    const requestBody = createChunkPlanningRequestBody(this.modelId, sourceBlocks)
    const response = await this.postPlanRequest(requestBody)
    const responseBody = await this.readResponseBody(response)
    const chunkStarts = mapChunkPlanningResponse(responseBody, sourceBlocks)

    return MarkdownChunkFactory.plan(source, chunkStarts)
  }

  private async postPlanRequest(body: string): Promise<Response> {
    let response: Response

    try {
      response = await fetch(this.config.chunkingApiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.chunkingApiKey ? { authorization: `Bearer ${this.config.chunkingApiKey}` } : {}),
        },
        body,
        signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new ChunkPlanningUnavailableException()
    }

    if (!response.ok) throw new ChunkPlanningUnavailableException()

    return response
  }

  private async readResponseBody(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch {
      throw new ChunkPlanningUnavailableException()
    }
  }
}
