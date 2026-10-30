import type { MarkdownChunkPlan } from '../DTOs/markdown-chunk-plan.dto.ts'
import type { PlanMarkdownChunksQuery } from '../Queries/plan-markdown-chunks.query.ts'

export abstract class PlanMarkdownChunksQueryHandlerContract {
  abstract execute(query: PlanMarkdownChunksQuery): Promise<MarkdownChunkPlan>
}
