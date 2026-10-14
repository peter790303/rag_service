import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MarkdownChunkFactory } from '../../../src/Domain/Knowledge/markdown-chunk.factory.js'

describe('MarkdownChunkFactory', () => {
  it('preserves source text, line endings, and model-selected block boundaries', () => {
    const source =
      '# Guide\r\n\r\n  - first item\r\n    continuation\r\n\r\n```ts\r\nconst value = 1\r\n```\r\n\r\n| key | value |\r\n| --- | --- |\r\n| a | b |\r\n\r\n[Manual](./manual.md#install)'
    const blocks = MarkdownChunkFactory.scan(source)
    const selectedStarts = [0, blocks[2]?.id].filter((blockId): blockId is number => blockId !== undefined)
    const plan = MarkdownChunkFactory.plan(source, selectedStarts)

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

    assert.deepEqual(MarkdownChunkFactory.scan(whitespace), [
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
    assert.deepEqual(MarkdownChunkFactory.plan(whitespace).chunks, [
      {
        content: whitespace,
        headingPath: [],
        blockStart: 0,
        blockEnd: 3,
        tokenCount: Math.ceil(whitespace.length / 4),
      },
    ])
    assert.deepEqual(MarkdownChunkFactory.scan(''), [])
    assert.deepEqual(MarkdownChunkFactory.plan(''), { chunks: [], relations: [] })
  })

  it('preserves Markdown and wiki link source types with their raw target, anchor, and evidence', () => {
    const source =
      '# Main\n\nSee [[Target Page#Section|label]] and [guide](../guide.md#Start).\n\n`[[inline-code]]`\n\n```md\n[[fenced-code]]\n```\n'
    const plan = MarkdownChunkFactory.plan(source)

    assert.deepEqual(
      plan.relations.map(({ targetReference, targetAnchor, relationType }) => ({
        targetReference,
        targetAnchor,
        relationType,
      })),
      [
        {
          targetReference: 'Target Page',
          targetAnchor: 'Section',
          relationType: 'wiki_link',
        },
        {
          targetReference: '../guide.md',
          targetAnchor: 'Start',
          relationType: 'markdown_link',
        },
      ],
    )
    assert.ok(plan.relations[0]?.evidenceText.includes('[[Target Page#Section|label]]'))
    assert.ok(plan.relations[1]?.evidenceText.includes('[guide](../guide.md#Start)'))
    assert.equal(
      plan.relations.some((relation) => relation.targetReference.includes('inline')),
      false,
    )
    assert.equal(
      plan.relations.some((relation) => relation.targetReference.includes('fenced')),
      false,
    )
  })

  it('rejects model starts that do not describe an ordered partition', () => {
    const source = '# One\n\nFirst.\n\n# Two\n\nSecond.'
    const blocks = MarkdownChunkFactory.scan(source)

    assert.throws(() => MarkdownChunkFactory.plan(source, [blocks[1]?.id ?? 1]), RangeError)
    assert.throws(() => MarkdownChunkFactory.plan(source, [0, 0]), RangeError)
    assert.throws(() => MarkdownChunkFactory.plan(source, [0, blocks.length]), RangeError)
  })
})
