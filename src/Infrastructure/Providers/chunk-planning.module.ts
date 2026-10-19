import { Module } from '@nestjs/common'

import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { ChunkPlanningProvider } from '../../Application/Chunks/Contracts/chunk-planning-provider.ts'
import { HostCliChunkPlanningClient } from '../External/ChunkPlanning/host-cli-chunk-planning.client.ts'
import { HttpChunkPlanningClient } from '../External/ChunkPlanning/http-chunk-planning.client.ts'

@Module({
  imports: [KnowledgeServiceConfigModule],
  providers: [
    HttpChunkPlanningClient,
    HostCliChunkPlanningClient,
    {
      provide: ChunkPlanningProvider,
      inject: [KNOWLEDGE_SERVICE_CONFIG, HostCliChunkPlanningClient, HttpChunkPlanningClient],
      useFactory: (
        config: KnowledgeServiceConfig,
        cli: HostCliChunkPlanningClient,
        http: HttpChunkPlanningClient,
      ): ChunkPlanningProvider => (config.chunkingTransport === 'http' ? http : cli),
    },
  ],
  exports: [ChunkPlanningProvider],
})
export class ChunkPlanningModule {}
