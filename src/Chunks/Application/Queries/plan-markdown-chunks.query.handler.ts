import type { PlanMarkdownChunksQuery } from './plan-markdown-chunks.query.ts'
import type { PlanMarkdownChunksQueryHandlerContract } from '../Contracts/plan-markdown-chunks.query.handler.contract.ts'
import type { MarkdownChunkPlan } from '../DTOs/markdown-chunk-plan.dto.ts'
import type { ChunkPlanningProvider } from '../Ports/Out/Gateways/chunk-planning-provider.ts'

export class PlanMarkdownChunksQueryHandler implements PlanMarkdownChunksQueryHandlerContract {
  constructor(private readonly provider: ChunkPlanningProvider) {}

  execute(query: PlanMarkdownChunksQuery): Promise<MarkdownChunkPlan> {
    return this.provider.plan(query.source, query.signal)
  }
}
