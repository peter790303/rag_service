import { Inject, Injectable } from '@nestjs/common'

import { createEmbeddingRequestBody } from './Adapters/embedding-request.adapter.ts'
import { mapEmbeddingResponse } from './Adapters/embedding-response.adapter.ts'
import {
  KNOWLEDGE_SERVICE_CONFIG,
  type KnowledgeServiceConfig,
} from '../../../../../config/knowledge-service.config.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../../KnowledgeBases/Application/Exceptions/knowledge-embedding-unavailable.exception.ts'
import { EmbeddingProvider } from '../../../Application/Ports/Out/Gateways/embedding-provider.ts'

@Injectable()
export class HttpEmbeddingClient extends EmbeddingProvider {
  constructor(
    @Inject(KNOWLEDGE_SERVICE_CONFIG)
    private readonly embeddingConfig: Pick<
      KnowledgeServiceConfig,
      'embeddingModel' | 'embeddingDimensions' | 'embeddingApiUrl' | 'embeddingApiKey' | 'externalRequestTimeoutMs'
    >,
  ) {
    super()
  }

  get modelId(): string {
    return this.embeddingConfig.embeddingModel
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    if (!texts.length) return []

    const requestBody = createEmbeddingRequestBody(this.modelId, texts)
    const response = await this.postEmbeddingRequest(requestBody, signal)
    const responseBody = await this.readResponseBody(response)

    return mapEmbeddingResponse(responseBody, texts.length, this.embeddingConfig.embeddingDimensions)
  }

  private async postEmbeddingRequest(body: string, signal?: AbortSignal): Promise<Response> {
    let response: Response
    try {
      response = await fetch(this.embeddingConfig.embeddingApiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.embeddingConfig.embeddingApiKey
            ? { authorization: `Bearer ${this.embeddingConfig.embeddingApiKey}` }
            : {}),
        },
        body,
        signal: signal
          ? AbortSignal.any([AbortSignal.timeout(this.embeddingConfig.externalRequestTimeoutMs), signal])
          : AbortSignal.timeout(this.embeddingConfig.externalRequestTimeoutMs),
      })
    } catch (cause) {
      throw new KnowledgeEmbeddingUnavailableException({ cause })
    }

    if (!response.ok) throw new KnowledgeEmbeddingUnavailableException()

    return response
  }

  private async readResponseBody(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch (cause) {
      throw new KnowledgeEmbeddingUnavailableException({ cause })
    }
  }
}
