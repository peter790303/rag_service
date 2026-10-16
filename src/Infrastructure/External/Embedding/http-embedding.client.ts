import { Inject, Injectable } from '@nestjs/common'

import { createEmbeddingRequestBody } from './Adapters/embedding-request.adapter.ts'
import { mapEmbeddingResponse } from './Adapters/embedding-response.adapter.ts'
import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import { EmbeddingProvider } from '../../../Application/KnowledgeBases/Contracts/embedding-provider.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../Application/KnowledgeBases/Exceptions/knowledge-embedding-unavailable.exception.ts'

const EXTERNAL_REQUEST_TIMEOUT_MS = 30_000

@Injectable()
export class HttpEmbeddingClient extends EmbeddingProvider {
  constructor(
    @Inject(KNOWLEDGE_SERVICE_CONFIG)
    private readonly embeddingConfig: Pick<
      KnowledgeServiceConfig,
      'embeddingModel' | 'embeddingDimensions' | 'embeddingApiUrl' | 'embeddingApiKey'
    >,
  ) {
    super()
  }

  get modelId(): string {
    return this.embeddingConfig.embeddingModel
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return []

    const requestBody = createEmbeddingRequestBody(this.modelId, texts)
    const response = await this.postEmbeddingRequest(requestBody)
    const responseBody = await this.readResponseBody(response)

    return mapEmbeddingResponse(responseBody, texts.length, this.embeddingConfig.embeddingDimensions)
  }

  private async postEmbeddingRequest(body: string): Promise<Response> {
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
        signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
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
