import type { MarkdownPlan } from '../../../Domain/Knowledge/markdown-chunk.factory.js'

/** Produces source-grounded chunk boundaries for an entire Markdown document. */
export abstract class ChunkPlanningProvider {
  abstract plan(source: string): Promise<MarkdownPlan>

  abstract get modelId(): string
}
