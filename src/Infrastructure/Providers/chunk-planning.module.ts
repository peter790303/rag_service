import { Module } from '@nestjs/common'

import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { ChunkPlanningProvider } from '../../Application/Chunks/Contracts/chunk-planning-provider.ts'
import { HttpChunkPlanningClient } from '../External/ChunkPlanning/http-chunk-planning.client.ts'

@Module({
  imports: [KnowledgeServiceConfigModule],
  providers: [HttpChunkPlanningClient, { provide: ChunkPlanningProvider, useExisting: HttpChunkPlanningClient }],
  exports: [ChunkPlanningProvider],
})
export class ChunkPlanningModule {}
