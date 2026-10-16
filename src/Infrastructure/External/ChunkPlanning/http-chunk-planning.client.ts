import { Inject, Injectable } from '@nestjs/common'

import { createChunkPlanningRequestBody } from './Adapters/chunk-planning-request.adapter.ts'
import { mapChunkPlanningResponse } from './Adapters/chunk-planning-response.adapter.ts'
import { MarkdownSourceAdapter } from './Adapters/markdown-source.adapter.ts'
import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import { ChunkPlanningProvider } from '../../../Application/Chunks/Contracts/chunk-planning-provider.ts'
import type { MarkdownChunkPlan } from '../../../Application/Chunks/DataTransferObjects/markdown-chunk-plan.dto.ts'
import { ChunkPlanningUnavailableException } from '../../../Application/Chunks/Exceptions/chunk-planning-unavailable.exception.ts'

const EXTERNAL_REQUEST_TIMEOUT_MS = 30_000

@Injectable()
export class HttpChunkPlanningClient extends ChunkPlanningProvider {
  constructor(
    @Inject(KNOWLEDGE_SERVICE_CONFIG)
    private readonly chunkPlanningConfig: Pick<
      KnowledgeServiceConfig,
      'chunkingModel' | 'chunkingApiUrl' | 'chunkingApiKey'
    >,
  ) {
    super()
  }

  get modelId(): string {
    return this.chunkPlanningConfig.chunkingModel
  }

  async plan(source: string): Promise<MarkdownChunkPlan> {
    const sourceScan = MarkdownSourceAdapter.scan(source)

    if (!sourceScan.blocks.length) return { chunks: [], relations: [] }

    const requestBody = createChunkPlanningRequestBody(this.modelId, sourceScan.blocks)
    const response = await this.postPlanRequest(requestBody)
    const responseBody = await this.readResponseBody(response)

    return mapChunkPlanningResponse(responseBody, source, sourceScan)
  }

  private async postPlanRequest(body: string): Promise<Response> {
    let response: Response

    try {
      response = await fetch(this.chunkPlanningConfig.chunkingApiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.chunkPlanningConfig.chunkingApiKey
            ? { authorization: `Bearer ${this.chunkPlanningConfig.chunkingApiKey}` }
            : {}),
        },
        body,
        signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
      })
    } catch (cause) {
      throw new ChunkPlanningUnavailableException({ cause })
    }

    if (!response.ok) throw new ChunkPlanningUnavailableException()

    return response
  }

  private async readResponseBody(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch (cause) {
      throw new ChunkPlanningUnavailableException({ cause })
    }
  }
}
