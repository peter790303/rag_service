import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MarkdownChunkStartsAdapter } from '../../../src/Chunks/Infrastructure/External/ChunkPlanning/Adapters/markdown-chunk-starts.adapter.ts'
import { MarkdownSourceAdapter } from '../../../src/Chunks/Infrastructure/External/ChunkPlanning/Adapters/markdown-source.adapter.ts'
import { EmptyMarkdownChunkStartsException } from '../../../src/Chunks/Infrastructure/External/ChunkPlanning/Exceptions/empty-markdown-chunk-starts.exception.ts'
import { MarkdownChunkStartOutOfBoundsException } from '../../../src/Chunks/Infrastructure/External/ChunkPlanning/Exceptions/markdown-chunk-start-out-of-bounds.exception.ts'
import { MarkdownChunkStartsNotIncreasingException } from '../../../src/Chunks/Infrastructure/External/ChunkPlanning/Exceptions/markdown-chunk-starts-not-increasing.exception.ts'
import { MarkdownFirstChunkStartRequiredException } from '../../../src/Chunks/Infrastructure/External/ChunkPlanning/Exceptions/markdown-first-chunk-start-required.exception.ts'

const source = '# One\n\nFirst.\n\n# Two\n\nSecond.'

describe('MarkdownChunkStartsAdapter', () => {
  it('rejects missing, repeated, unordered, fractional and out-of-range starts', () => {
    const { blocks } = MarkdownSourceAdapter.scan(source)
    const invalidStarts = [
      { starts: [], exception: MarkdownFirstChunkStartRequiredException },
      { starts: [blocks[1]?.id ?? 1], exception: MarkdownFirstChunkStartRequiredException },
      { starts: [0, 0], exception: MarkdownChunkStartsNotIncreasingException },
      { starts: [0, blocks.length], exception: MarkdownChunkStartOutOfBoundsException },
      { starts: [0, -1], exception: MarkdownChunkStartOutOfBoundsException },
      { starts: [0, 1.5], exception: MarkdownChunkStartOutOfBoundsException },
      { starts: [0, NaN], exception: MarkdownChunkStartOutOfBoundsException },
      { starts: [0, Infinity], exception: MarkdownChunkStartOutOfBoundsException },
      { starts: [0, 2, 1], exception: MarkdownChunkStartsNotIncreasingException },
    ]

    invalidStarts.forEach(({ starts, exception }) => {
      assert.throws(() => MarkdownChunkStartsAdapter.toChunks(source, blocks, starts), exception)
    })
  })

  it('retains selected exact spans, headings and source line positions', () => {
    const { blocks } = MarkdownSourceAdapter.scan(source)
    const secondHeading = blocks.find((block) => block.headingPath.includes('Two'))

    assert.ok(secondHeading)

    const chunks = MarkdownChunkStartsAdapter.toChunks(source, blocks, [0, secondHeading.id])

    assert.deepEqual(
      chunks.map((chunk) => chunk.content),
      [source.slice(0, secondHeading.startOffset), source.slice(secondHeading.startOffset)],
    )
    assert.deepEqual(
      chunks.map((chunk) => chunk.headingPath),
      [['One'], ['Two']],
    )
    assert.equal(chunks[0]?.blockStart, 0)
    assert.equal(chunks[0]?.blockEnd, secondHeading.startLine)
    assert.equal(chunks[1]?.blockStart, secondHeading.startLine)
    assert.equal(chunks[1]?.blockEnd, blocks.at(-1)?.endLine)
  })

  it('rejects starts on empty input and returns no chunks for an empty partition', () => {
    assert.deepEqual(MarkdownChunkStartsAdapter.toChunks('', [], []), [])
    assert.throws(() => MarkdownChunkStartsAdapter.toChunks('', [], [0]), EmptyMarkdownChunkStartsException)
    assert.throws(() => MarkdownChunkStartsAdapter.toChunks(source, [], [0]), MarkdownChunkStartOutOfBoundsException)
  })
})
