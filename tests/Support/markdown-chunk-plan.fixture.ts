import type { MarkdownChunkPlan } from '../../src/Chunks/Application/DTOs/markdown-chunk-plan.dto.ts'
import { MarkdownChunkStartsAdapter } from '../../src/Chunks/Infrastructure/External/ChunkPlanning/Adapters/markdown-chunk-starts.adapter.ts'
import { MarkdownDocumentLinksAdapter } from '../../src/Chunks/Infrastructure/External/ChunkPlanning/Adapters/markdown-document-links.adapter.ts'
import { MarkdownSourceAdapter } from '../../src/Chunks/Infrastructure/External/ChunkPlanning/Adapters/markdown-source.adapter.ts'

/** Creates a deterministic plan for tests that do not exercise the external model. */
export const createMarkdownChunkPlan = (source: string, chunkStarts?: readonly number[]): MarkdownChunkPlan => {
  const sourceScan = MarkdownSourceAdapter.scan(source)
  const selectedStarts = chunkStarts ?? (sourceScan.blocks.length ? [0] : [])

  return {
    chunks: MarkdownChunkStartsAdapter.toChunks(source, sourceScan.blocks, selectedStarts),
    relations: MarkdownDocumentLinksAdapter.toRelations(sourceScan.relationBlocks),
  }
}
