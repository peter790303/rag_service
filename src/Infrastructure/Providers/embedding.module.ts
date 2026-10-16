import { Module } from '@nestjs/common'

import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { EmbeddingProvider } from '../../Application/KnowledgeBases/Contracts/embedding-provider.ts'
import { HttpEmbeddingClient } from '../External/Embedding/http-embedding.client.ts'

@Module({
  imports: [KnowledgeServiceConfigModule],
  providers: [HttpEmbeddingClient, { provide: EmbeddingProvider, useExisting: HttpEmbeddingClient }],
  exports: [EmbeddingProvider],
})
export class EmbeddingModule {}
