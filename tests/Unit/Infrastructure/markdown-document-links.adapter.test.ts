import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MarkdownDocumentLinksAdapter } from '../../../src/DocumentIndexes/Infrastructure/External/ChunkPlanning/Adapters/markdown-document-links.adapter.ts'
import { MarkdownSourceAdapter } from '../../../src/DocumentIndexes/Infrastructure/External/ChunkPlanning/Adapters/markdown-source.adapter.ts'

describe('MarkdownDocumentLinksAdapter', () => {
  it('preserves Markdown and wiki link source types with their raw target, anchor, and evidence', () => {
    const source =
      '# Main\n\nSee [[Target Page#Section|label]] and [guide](../guide.md#Start).\n\n`[[inline-code]]`\n\n```md\n[[fenced-code]]\n```\n'
    const sourceScan = MarkdownSourceAdapter.scan(source)
    const relations = MarkdownDocumentLinksAdapter.toRelations(sourceScan.relationBlocks)

    assert.deepEqual(
      relations.map(({ targetReference, targetAnchor, relationType }) => ({
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
    assert.ok(relations[0]?.evidenceText.includes('[[Target Page#Section|label]]'))
    assert.ok(relations[1]?.evidenceText.includes('[guide](../guide.md#Start)'))
    assert.equal(
      relations.some((relation) => relation.targetReference.includes('inline')),
      false,
    )
    assert.equal(
      relations.some((relation) => relation.targetReference.includes('fenced')),
      false,
    )
  })
})
