import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import { PlanMarkdownChunksQueryHandlerContract } from '../../../Chunks/Application/Contracts/plan-markdown-chunks.query.handler.contract.ts'
import { ChunkPlanningProvider } from '../../../Chunks/Application/Ports/Out/Gateways/chunk-planning-provider.ts'
import { PlanMarkdownChunksQueryHandler } from '../../../Chunks/Application/Queries/plan-markdown-chunks.query.handler.ts'
import { HostCliChunkPlanningClient } from '../../../Chunks/Infrastructure/External/ChunkPlanning/host-cli-chunk-planning.client.ts'
import { HttpChunkPlanningClient } from '../../../Chunks/Infrastructure/External/ChunkPlanning/http-chunk-planning.client.ts'

export const chunkPlanningProviders = [
  {
    provide: PlanMarkdownChunksQueryHandlerContract,
    useFactory: (provider: ChunkPlanningProvider) => new PlanMarkdownChunksQueryHandler(provider),
    inject: [ChunkPlanningProvider],
  },
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
]
