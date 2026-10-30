import type { MarkdownSourceBlock } from '../../../../Application/DataTransferObjects/markdown-source-block.dto.ts'
import type { PlannedMarkdownChunk } from '../../../../Application/DataTransferObjects/planned-markdown-chunk.dto.ts'
import { EmptyMarkdownChunkStartsException } from '../Exceptions/empty-markdown-chunk-starts.exception.ts'
import { MarkdownChunkStartOutOfBoundsException } from '../Exceptions/markdown-chunk-start-out-of-bounds.exception.ts'
import { MarkdownChunkStartsNotIncreasingException } from '../Exceptions/markdown-chunk-starts-not-increasing.exception.ts'
import { MarkdownFirstChunkStartRequiredException } from '../Exceptions/markdown-first-chunk-start-required.exception.ts'

/** Validates selected block positions and copies their exact source spans. */
export class MarkdownChunkStartsAdapter {
  static toChunks(
    source: string,
    blocks: readonly MarkdownSourceBlock[],
    chunkStarts: readonly number[],
  ): PlannedMarkdownChunk[] {
    if (!source.length) {
      if (chunkStarts.length) throw new EmptyMarkdownChunkStartsException()

      return []
    }

    MarkdownChunkStartsAdapter.validateChunkStarts(chunkStarts, blocks.length)

    return chunkStarts.map((blockId, index) => {
      const firstBlock = blocks[blockId]
      const nextChunkBlock = blocks[chunkStarts[index + 1] ?? blocks.length]
      const lastBlock = blocks[(chunkStarts[index + 1] ?? blocks.length) - 1]

      if (!firstBlock || !lastBlock)
        throw new MarkdownChunkStartOutOfBoundsException({ blockId, blockCount: blocks.length })

      const endOffset = nextChunkBlock?.startOffset ?? source.length
      const content = source.slice(firstBlock.startOffset, endOffset)

      return {
        content,
        headingPath: firstBlock.headingPath,
        blockStart: firstBlock.startLine,
        blockEnd: lastBlock.endLine,
        tokenCount: Math.ceil(content.length / 4),
      }
    })
  }

  private static validateChunkStarts(chunkStarts: readonly number[], blockCount: number): void {
    if (!chunkStarts.length || chunkStarts[0] !== 0) {
      throw new MarkdownFirstChunkStartRequiredException()
    }

    const validationError = chunkStarts.reduce<
      MarkdownChunkStartOutOfBoundsException | MarkdownChunkStartsNotIncreasingException | null
    >((firstError, blockId, index) => {
      if (firstError) return firstError

      if (!Number.isInteger(blockId) || blockId < 0 || blockId >= blockCount) {
        return new MarkdownChunkStartOutOfBoundsException({ blockId, blockCount })
      }

      if (index > 0 && blockId <= (chunkStarts[index - 1] ?? -1)) {
        return new MarkdownChunkStartsNotIncreasingException({ previousBlockId: chunkStarts[index - 1] ?? -1, blockId })
      }

      return null
    }, null)

    if (validationError) throw validationError
  }
}
