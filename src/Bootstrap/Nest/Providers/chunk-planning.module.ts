import { Module } from '@nestjs/common'

import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { PlanMarkdownChunksQueryHandlerContract } from '../../../Chunks/Application/Contracts/plan-markdown-chunks.query.handler.contract.ts'
import { ChunkPlanningProvider } from '../../../Chunks/Application/Ports/Out/Gateways/chunk-planning-provider.ts'
import { chunkPlanningProviders } from '../../../Chunks/Infrastructure/Nest/Providers/chunk-planning.providers.ts'

@Module({
  imports: [KnowledgeServiceConfigModule],
  providers: chunkPlanningProviders,
  exports: [ChunkPlanningProvider, PlanMarkdownChunksQueryHandlerContract],
})
export class ChunkPlanningModule {}
