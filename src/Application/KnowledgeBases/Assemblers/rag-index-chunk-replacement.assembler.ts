import type { MarkdownPlan } from '../../../Domain/Knowledge/markdown-chunk.factory.js'
import type { RagChunkReplacementWrite } from '../Contracts/rag-index-chunk-replacement-store.js'

/** Maps a validated Markdown plan and aligned provider outputs into persistence rows. */
export const assembleRagChunkReplacementRows = (
  documentIndexId: string,
  plan: MarkdownPlan,
  vectors: readonly number[][],
  lexicalSearchTexts: readonly string[],
): RagChunkReplacementWrite[] =>
  plan.chunks.map((chunk, ordinal) => {
    const embedding = vectors[ordinal]
    const searchVector = lexicalSearchTexts[ordinal]

    if (embedding === undefined || searchVector === undefined) throw new RangeError('Replacement output is incomplete')

    return {
      documentIndexId,
      ordinal,
      headingPath: [...chunk.headingPath],
      content: chunk.content,
      blockStart: chunk.blockStart,
      blockEnd: chunk.blockEnd,
      tokenCount: chunk.tokenCount,
      embedding: [...embedding],
      searchVector,
    }
  })
