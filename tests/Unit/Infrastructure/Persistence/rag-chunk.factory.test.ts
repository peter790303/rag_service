import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { MarkdownPlan } from '../../../../src/Domain/Knowledge/markdown-chunk.factory.js'
import { RagChunkFactory } from '../../../../src/Infrastructure/Persistence/Factories/rag-chunk.factory.js'

describe('RagChunkFactory', () => {
  it('maps ordered planned chunks and their paired vectors into zero-based persistence ordinals', () => {
    const plan: MarkdownPlan = {
      chunks: [
        { content: 'first', headingPath: ['Start'], blockStart: 0, blockEnd: 1, tokenCount: 2 },
        { content: 'second', headingPath: ['Next'], blockStart: 2, blockEnd: 3, tokenCount: 2 },
      ],
      relations: [],
    }

    const rows = RagChunkFactory.fromPlan(
      'index-id',
      plan,
      [
        [1, 0],
        [0, 1],
      ],
      ['first-vector', 'second-vector'],
    )

    assert.deepEqual(
      rows.map(({ documentIndexId, ordinal, content, embedding, searchVector }) => ({
        documentIndexId,
        ordinal,
        content,
        embedding,
        searchVector,
      })),
      [
        {
          documentIndexId: 'index-id',
          ordinal: 0,
          content: 'first',
          embedding: [1, 0],
          searchVector: 'first-vector',
        },
        {
          documentIndexId: 'index-id',
          ordinal: 1,
          content: 'second',
          embedding: [0, 1],
          searchVector: 'second-vector',
        },
      ],
    )
  })

  it('rejects persistence inputs that cannot be paired with every planned chunk', () => {
    const plan: MarkdownPlan = {
      chunks: [{ content: 'only', headingPath: [], blockStart: 0, blockEnd: 0, tokenCount: 1 }],
      relations: [],
    }

    assert.throws(
      () => RagChunkFactory.fromPlan('index-id', plan, [], ['search']),
      /must match the planned chunk count/,
    )
    assert.throws(() => RagChunkFactory.fromPlan('index-id', plan, [[1]], []), /must match the planned chunk count/)
  })
})
