import { Inject, Injectable } from '@nestjs/common'

import { RAG_CONFIG, type RagConfig } from '../../../../../config/rag.config.js'
import { EmbeddingProvider } from '../../../../Application/KnowledgeBases/Contracts/embedding-provider.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../../Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'

const EXTERNAL_REQUEST_TIMEOUT_MS = 30_000

const isNumberArray = (candidateVector: unknown): candidateVector is number[] =>
  Array.isArray(candidateVector) &&
  candidateVector.every((component: unknown) => typeof component === 'number' && Number.isFinite(component))

@Injectable()
export class HttpEmbeddingAdapter extends EmbeddingProvider {
  constructor(@Inject(RAG_CONFIG) private readonly config: RagConfig) {
    super()
  }

  get modelId(): string {
    return this.config.embeddingModel
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return []

    const endpoint = this.config.embeddingApiUrl
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.embeddingApiKey ? { authorization: `Bearer ${this.config.embeddingApiKey}` } : {}),
        },
        body: JSON.stringify({ model: this.modelId, input: texts }),
        signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new KnowledgeEmbeddingUnavailableException()
    }

    if (!response.ok) throw new KnowledgeEmbeddingUnavailableException()

    let responseBody: unknown
    try {
      responseBody = await response.json()
    } catch {
      throw new KnowledgeEmbeddingUnavailableException()
    }

    if (
      typeof responseBody !== 'object' ||
      responseBody === null ||
      !('data' in responseBody) ||
      !Array.isArray(responseBody.data)
    ) {
      throw new KnowledgeEmbeddingUnavailableException()
    }

    const vectors = responseBody.data.map((embeddingRecord: unknown) => {
      if (
        typeof embeddingRecord !== 'object' ||
        embeddingRecord === null ||
        !('embedding' in embeddingRecord) ||
        !isNumberArray(embeddingRecord.embedding)
      ) {
        throw new KnowledgeEmbeddingUnavailableException()
      }

      return embeddingRecord.embedding
    })

    if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== this.config.embeddingDimensions))
      throw new KnowledgeEmbeddingUnavailableException()

    return vectors
  }
}
