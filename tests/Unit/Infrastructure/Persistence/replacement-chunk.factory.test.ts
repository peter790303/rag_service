import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { MarkdownChunkPlan } from '../../../../src/Application/Chunks/DataTransferObjects/markdown-chunk-plan.dto.ts'
import { ChunkSourceSpanReversedException } from '../../../../src/Domain/Chunk/Exceptions/chunk-source-span-reversed.exception.ts'
import { ChunkPersistenceCountMismatchException } from '../../../../src/Infrastructure/Persistence/Exceptions/chunk-persistence-count-mismatch.exception.ts'
import { ChunkPersistenceEntryMissingException } from '../../../../src/Infrastructure/Persistence/Exceptions/chunk-persistence-entry-missing.exception.ts'
import { ReplacementChunkFactory } from '../../../../src/Infrastructure/Persistence/Factories/replacement-chunk.factory.ts'

const replacementCreatedAt = new Date('2026-10-15T04:05:06.789Z')

describe('ReplacementChunkFactory', () => {
  it('maps ordered planned chunks and their paired vectors into zero-based persistence ordinals', () => {
    const replacementChunkPlanDTO: MarkdownChunkPlan = {
      chunks: [
        { content: 'first', headingPath: ['Start'], blockStart: 0, blockEnd: 1, tokenCount: 2 },
        { content: 'second', headingPath: ['Next'], blockStart: 2, blockEnd: 3, tokenCount: 2 },
      ],
      relations: [],
    }

    const replacementChunkModels = ReplacementChunkFactory.toReplacementChunkModels(
      'index-id',
      replacementChunkPlanDTO,
      [
        [1, 0],
        [0, 1],
      ],
      ['first-vector', 'second-vector'],
      replacementCreatedAt,
    )

    assert.equal(new Set(replacementChunkModels.map((replacementChunkModel) => replacementChunkModel.id)).size, 2)
    replacementChunkModels.forEach((replacementChunkModel) => {
      assert.match(replacementChunkModel.id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i)
      assert.deepEqual(replacementChunkModel.createdAt, replacementCreatedAt)
    })

    assert.deepEqual(
      replacementChunkModels.map(({ documentIndexId, ordinal, content, embedding, searchVector }) => ({
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

  it('applies domain source-span invariants before producing persistence rows', () => {
    const replacementChunkPlanDTO: MarkdownChunkPlan = {
      chunks: [{ content: 'body', headingPath: [], blockStart: 2, blockEnd: 1, tokenCount: 1 }],
      relations: [],
    }

    assert.throws(
      () =>
        ReplacementChunkFactory.toReplacementChunkModels(
          'index-id',
          replacementChunkPlanDTO,
          [[1]],
          ['search'],
          replacementCreatedAt,
        ),
      ChunkSourceSpanReversedException,
    )
  })

  it('rejects persistence inputs that cannot be paired with every planned chunk', () => {
    const replacementChunkPlanDTO: MarkdownChunkPlan = {
      chunks: [{ content: 'only', headingPath: [], blockStart: 0, blockEnd: 0, tokenCount: 1 }],
      relations: [],
    }

    assert.throws(
      () =>
        ReplacementChunkFactory.toReplacementChunkModels(
          'index-id',
          replacementChunkPlanDTO,
          [],
          ['search'],
          replacementCreatedAt,
        ),
      {
        name: ChunkPersistenceCountMismatchException.name,
        message: 'Chunk persistence inputs must match the planned chunk count',
      },
    )
    assert.throws(
      () =>
        ReplacementChunkFactory.toReplacementChunkModels(
          'index-id',
          replacementChunkPlanDTO,
          [[1]],
          [],
          replacementCreatedAt,
        ),
      {
        name: ChunkPersistenceCountMismatchException.name,
        message: 'Chunk persistence inputs must match the planned chunk count',
      },
    )
  })

  it('rejects a missing paired value even when input array lengths match the plan', () => {
    const replacementChunkPlanDTO: MarkdownChunkPlan = {
      chunks: [{ content: 'only', headingPath: [], blockStart: 0, blockEnd: 0, tokenCount: 1 }],
      relations: [],
    }
    const missingVectors = new Array<number[]>(1)
    const missingSearchTexts = new Array<string>(1)
    const expected = {
      name: ChunkPersistenceEntryMissingException.name,
      message: 'Chunk persistence inputs must contain every planned chunk',
    }

    assert.throws(
      () =>
        ReplacementChunkFactory.toReplacementChunkModels(
          'index-id',
          replacementChunkPlanDTO,
          missingVectors,
          ['search'],
          replacementCreatedAt,
        ),
      expected,
    )
    assert.throws(
      () =>
        ReplacementChunkFactory.toReplacementChunkModels(
          'index-id',
          replacementChunkPlanDTO,
          [[1]],
          missingSearchTexts,
          replacementCreatedAt,
        ),
      expected,
    )
  })
})
