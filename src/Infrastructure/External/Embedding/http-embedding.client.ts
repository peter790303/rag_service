import { Inject, Injectable } from '@nestjs/common'

import { createEmbeddingRequestBody } from './Adapter/embedding-request.adapter.js'
import { mapEmbeddingResponse } from './Adapter/embedding-response.adapter.js'
import { RAG_CONFIG, type RagConfig } from '../../../../config/rag.config.js'
import { EmbeddingProvider } from '../../../Application/KnowledgeBases/Contracts/embedding-provider.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'

const EXTERNAL_REQUEST_TIMEOUT_MS = 30_000

@Injectable()
export class HttpEmbeddingClient extends EmbeddingProvider {
  constructor(
    @Inject(RAG_CONFIG)
    private readonly config: Pick<
      RagConfig,
      'embeddingModel' | 'embeddingDimensions' | 'embeddingApiUrl' | 'embeddingApiKey'
    >,
  ) {
    super()
  }

  get modelId(): string {
    return this.config.embeddingModel
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return []

    const requestBody = createEmbeddingRequestBody(this.modelId, texts)
    const response = await this.postEmbeddingRequest(requestBody)
    const responseBody = await this.readResponseBody(response)

    return mapEmbeddingResponse(responseBody, texts.length, this.config.embeddingDimensions)
  }

  private async postEmbeddingRequest(body: string): Promise<Response> {
    let response: Response
    try {
      response = await fetch(this.config.embeddingApiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.embeddingApiKey ? { authorization: `Bearer ${this.config.embeddingApiKey}` } : {}),
        },
        body,
        signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new KnowledgeEmbeddingUnavailableException()
    }

    if (!response.ok) throw new KnowledgeEmbeddingUnavailableException()

    return response
  }

  private async readResponseBody(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch {
      throw new KnowledgeEmbeddingUnavailableException()
    }
  }
}
