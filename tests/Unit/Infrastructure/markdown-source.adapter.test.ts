import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MarkdownSourceAdapter } from '../../../src/Chunks/Infrastructure/External/ChunkPlanning/Adapters/markdown-source.adapter.ts'
import { createMarkdownChunkPlan } from '../../Support/markdown-chunk-plan.fixture.ts'

describe('MarkdownSourceAdapter', () => {
  it('retains dense ancestor paths when headings start below level one or skip levels', () => {
    const source = '## Guide\n#### Deep topic\n### Adjacent topic\n## Peer topic\n# Root\n### Child'
    const { blocks } = MarkdownSourceAdapter.scan(source)
    const plan = createMarkdownChunkPlan(
      source,
      blocks.map((block) => block.id),
    )
    const expectedHeadingPaths = [
      ['Guide'],
      ['Guide', 'Deep topic'],
      ['Guide', 'Adjacent topic'],
      ['Peer topic'],
      ['Root'],
      ['Root', 'Child'],
    ]

    assert.deepEqual(
      blocks.map((block) => block.headingPath),
      expectedHeadingPaths,
    )
    assert.deepEqual(
      plan.chunks.map((chunk) => chunk.headingPath),
      expectedHeadingPaths,
    )
    assert.equal(plan.chunks.map((chunk) => chunk.content).join(''), source)
  })

  it('preserves source text, line endings, and model-selected block boundaries', () => {
    const source =
      '# Guide\r\n\r\n  - first item\r\n    continuation\r\n\r\n```ts\r\nconst value = 1\r\n```\r\n\r\n| key | value |\r\n| --- | --- |\r\n| a | b |\r\n\r\n[Manual](./manual.md#install)'
    const blocks = MarkdownSourceAdapter.scan(source).blocks
    const selectedStarts = [0, blocks[2]?.id].filter((blockId): blockId is number => blockId !== undefined)
    const plan = createMarkdownChunkPlan(source, selectedStarts)

    assert.ok(blocks.length > 2)
    assert.equal(blocks.map((block) => block.text).join(''), source)
    assert.ok(
      blocks.every(
        (block) =>
          source.slice(block.startOffset, block.endOffset) === block.text && block.endOffset > block.startOffset,
      ),
    )
    assert.equal(plan.chunks.map((chunk) => chunk.content).join(''), source)
    assert.equal(plan.chunks[0]?.content, source.slice(0, blocks[selectedStarts[1] ?? 0]?.startOffset))
    assert.equal(plan.chunks[1]?.content, source.slice(blocks[selectedStarts[1] ?? 0]?.startOffset))
    assert.ok(plan.chunks[0]?.content.includes('  - first item\r\n    continuation\r\n'))
    assert.ok(plan.chunks.some((chunk) => chunk.content.includes('```ts\r\nconst value = 1\r\n```\r\n')))
    assert.ok(plan.chunks[1]?.content.includes('| key | value |\r\n'))
    assert.ok(plan.chunks[1]?.content.includes('[Manual](./manual.md#install)'))
  })

  it('emits one exact block for whitespace-only input and no chunks for empty input', () => {
    const whitespace = ' \t\r\n\r\n  '

    assert.deepEqual(MarkdownSourceAdapter.scan(whitespace).blocks, [
      {
        id: 0,
        startOffset: 0,
        endOffset: whitespace.length,
        startLine: 0,
        endLine: 3,
        text: whitespace,
        headingPath: [],
      },
    ])
    assert.deepEqual(createMarkdownChunkPlan(whitespace).chunks, [
      {
        content: whitespace,
        headingPath: [],
        blockStart: 0,
        blockEnd: 3,
        tokenCount: Math.ceil(whitespace.length / 4),
      },
    ])
    assert.deepEqual(MarkdownSourceAdapter.scan('').blocks, [])
    assert.deepEqual(createMarkdownChunkPlan(''), { chunks: [], relations: [] })
  })
})
