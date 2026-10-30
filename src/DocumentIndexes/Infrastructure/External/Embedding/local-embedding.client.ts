import { Inject, Injectable } from '@nestjs/common'

import { mapEmbeddingResponse } from './Adapters/embedding-response.adapter.ts'
import { executeLocalEmbedding } from './local-embedding-execution.ts'
import {
  KNOWLEDGE_SERVICE_CONFIG,
  type KnowledgeServiceConfig,
} from '../../../../../config/knowledge-service.config.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../../KnowledgeBases/Application/Exceptions/knowledge-embedding-unavailable.exception.ts'
import { EmbeddingProvider } from '../../../../Shared/Application/Ports/Out/Gateways/embedding-provider.ts'

@Injectable()
export class LocalEmbeddingClient extends EmbeddingProvider {
  constructor(
    @Inject(KNOWLEDGE_SERVICE_CONFIG)
    private readonly embeddingConfig: Pick<
      KnowledgeServiceConfig,
      'embeddingModel' | 'embeddingRevision' | 'embeddingCacheDir' | 'embeddingDimensions' | 'externalRequestTimeoutMs'
    >,
  ) {
    super()
  }

  get modelId(): string {
    return `${this.embeddingConfig.embeddingModel}@${this.embeddingConfig.embeddingRevision}:cpu:q8:mean:normalize:full-text-v1`
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    if (!texts.length) return []

    try {
      const vectors = await executeLocalEmbedding(
        {
          model: this.embeddingConfig.embeddingModel,
          revision: this.embeddingConfig.embeddingRevision,
          cacheDir: this.embeddingConfig.embeddingCacheDir,
          texts,
        },
        this.embeddingConfig.externalRequestTimeoutMs,
        signal,
      )

      if (!Array.isArray(vectors)) throw new KnowledgeEmbeddingUnavailableException()

      return mapEmbeddingResponse(
        { data: vectors.map((embedding: unknown) => ({ embedding })) },
        texts.length,
        this.embeddingConfig.embeddingDimensions,
      )
    } catch (cause) {
      if (cause instanceof KnowledgeEmbeddingUnavailableException) throw cause

      throw new KnowledgeEmbeddingUnavailableException({ cause })
    }
  }
}
