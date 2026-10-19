import type { MarkdownChunkPlan } from '../DataTransferObjects/markdown-chunk-plan.dto.ts'

/** Produces source-grounded chunk boundaries for an entire Markdown document. */
export abstract class ChunkPlanningProvider {
  abstract plan(source: string, signal?: AbortSignal): Promise<MarkdownChunkPlan>

  abstract get modelId(): string
}
