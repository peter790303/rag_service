import type { MarkdownSourceBlock } from '../../../../Domain/Knowledge/markdown-chunk.factory.js'

const SYSTEM_MESSAGE =
  'Return only a JSON object with chunkStarts: an ordered array of block IDs. Choose starts that preserve complete semantic units. The first block must start a chunk. Do not rewrite or omit source text.'

/** Converts local Markdown blocks into the external model request body. */
export const createChunkPlanningRequestBody = (
  modelId: string,
  sourceBlocks: readonly MarkdownSourceBlock[],
): string => {
  const blocks = sourceBlocks.map((block) => ({ id: `block-${block.id}`, content: block.text }))

  return JSON.stringify({
    model: modelId,
    messages: [
      { role: 'system', content: SYSTEM_MESSAGE },
      { role: 'user', content: JSON.stringify({ blocks }) },
    ],
  })
}
