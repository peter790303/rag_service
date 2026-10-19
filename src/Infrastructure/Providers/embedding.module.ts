import { Module } from '@nestjs/common'

import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { EmbeddingProvider } from '../../Application/KnowledgeBases/Contracts/embedding-provider.ts'
import { HttpEmbeddingClient } from '../External/Embedding/http-embedding.client.ts'
import { LocalEmbeddingClient } from '../External/Embedding/local-embedding.client.ts'

@Module({
  imports: [KnowledgeServiceConfigModule],
  providers: [
    HttpEmbeddingClient,
    LocalEmbeddingClient,
    {
      provide: EmbeddingProvider,
      inject: [KNOWLEDGE_SERVICE_CONFIG, LocalEmbeddingClient, HttpEmbeddingClient],
      useFactory: (
        config: KnowledgeServiceConfig,
        local: LocalEmbeddingClient,
        http: HttpEmbeddingClient,
      ): EmbeddingProvider => (config.embeddingTransport === 'local' ? local : http),
    },
  ],
  exports: [EmbeddingProvider],
})
export class EmbeddingModule {}
