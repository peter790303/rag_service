import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { Chunk, type ChunkState } from '../../../../src/Domain/Chunk/chunk.ts'
import { ChunkDocumentIndexRequiredException } from '../../../../src/Domain/Chunk/Exceptions/chunk-document-index-required.exception.ts'
import { ChunkIdentityRequiredException } from '../../../../src/Domain/Chunk/Exceptions/chunk-identity-required.exception.ts'
import { ChunkSourceSpanReversedException } from '../../../../src/Domain/Chunk/Exceptions/chunk-source-span-reversed.exception.ts'
import { InvalidChunkBlockEndException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-block-end.exception.ts'
import { InvalidChunkBlockStartException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-block-start.exception.ts'
import { InvalidChunkContentException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-content.exception.ts'
import { InvalidChunkHeadingPathException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-heading-path.exception.ts'
import { InvalidChunkOrdinalException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-ordinal.exception.ts'
import { InvalidChunkTokenCountException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-token-count.exception.ts'
import { ChunkFactory } from '../../../../src/Infrastructure/Persistence/Factories/chunk.factory.ts'
import { ChunkModel } from '../../../../src/Infrastructure/Persistence/Models/chunk.model.ts'

const createChunkModel = (chunkStateOverrides: Partial<ChunkState> = {}): ChunkModel =>
  Object.assign(new ChunkModel(), {
    id: 'chunk-1',
    documentIndexId: 'index-1',
    ordinal: 0,
    headingPath: ['Title', '小節'],
    content: '  indented\r\nbody\n',
    blockStart: 0,
    blockEnd: 2,
    tokenCount: null,
    embedding: [0.2, 0.3],
    searchVector: "'body':1",
    createdAt: new Date('2026-10-15T00:00:00.000Z'),
    ...chunkStateOverrides,
  })

describe('ChunkFactory', () => {
  it('restores a real Chunk with its persisted identity, owner and original source fields', () => {
    const persistedChunkModel = createChunkModel()
    const chunk = ChunkFactory.toChunk(persistedChunkModel)

    assert.ok(chunk instanceof Chunk)
    assert.equal(chunk.id, persistedChunkModel.id)
    assert.equal(chunk.documentIndexId, persistedChunkModel.documentIndexId)
    assert.equal(chunk.ordinal, persistedChunkModel.ordinal)
    assert.deepEqual(chunk.headingPath, persistedChunkModel.headingPath)
    assert.equal(chunk.content, persistedChunkModel.content)
    assert.equal(chunk.blockStart, persistedChunkModel.blockStart)
    assert.equal(chunk.blockEnd, persistedChunkModel.blockEnd)
    assert.equal(chunk.tokenCount, null)
    assert.deepEqual(chunk.embedding, persistedChunkModel.embedding)
    assert.equal(chunk.searchVector, persistedChunkModel.searchVector)
    assert.deepEqual(chunk.createdAt, persistedChunkModel.createdAt)
    assert.equal(chunk.vectorCosineDistanceFor([1, 0]), null)
    assert.doesNotThrow(() => chunk.assertBelongsToDocumentIndex(persistedChunkModel.documentIndexId))
  })

  it('isolates restored headings, embeddings and timestamps from mutable ORM model state', () => {
    const persistedChunkModel = createChunkModel()
    const chunk = ChunkFactory.toChunk(persistedChunkModel)
    persistedChunkModel.headingPath[0] = 'Changed after restoration'
    persistedChunkModel.headingPath.push('Added after restoration')
    persistedChunkModel.embedding[0] = 99
    persistedChunkModel.createdAt.setUTCFullYear(2000)

    assert.deepEqual(chunk.headingPath, ['Title', '小節'])
    assert.deepEqual(chunk.embedding, [0.2, 0.3])
    assert.deepEqual(chunk.createdAt, new Date('2026-10-15T00:00:00.000Z'))
  })

  it('applies the same domain invariants to persisted state instead of bypassing construction', async (t) => {
    const invalidRows: readonly { name: string; state: Partial<ChunkState>; exception: new () => Error }[] = [
      { name: 'missing identity', state: { id: '' }, exception: ChunkIdentityRequiredException },
      { name: 'missing owner', state: { documentIndexId: '' }, exception: ChunkDocumentIndexRequiredException },
      { name: 'negative ordinal', state: { ordinal: -1 }, exception: InvalidChunkOrdinalException },
      { name: 'fractional ordinal', state: { ordinal: 0.5 }, exception: InvalidChunkOrdinalException },
      {
        name: 'invalid heading entry',
        state: { headingPath: [false] as unknown as string[] },
        exception: InvalidChunkHeadingPathException,
      },
      {
        name: 'invalid content',
        state: { content: null as unknown as string },
        exception: InvalidChunkContentException,
      },
      { name: 'negative source start', state: { blockStart: -1 }, exception: InvalidChunkBlockStartException },
      { name: 'fractional source start', state: { blockStart: 0.5 }, exception: InvalidChunkBlockStartException },
      { name: 'negative source end', state: { blockEnd: -1 }, exception: InvalidChunkBlockEndException },
      { name: 'fractional source end', state: { blockEnd: 2.5 }, exception: InvalidChunkBlockEndException },
      {
        name: 'reversed source span',
        state: { blockStart: 3, blockEnd: 2 },
        exception: ChunkSourceSpanReversedException,
      },
      { name: 'negative token count', state: { tokenCount: -1 }, exception: InvalidChunkTokenCountException },
      { name: 'fractional token count', state: { tokenCount: 0.5 }, exception: InvalidChunkTokenCountException },
      { name: 'non-finite token count', state: { tokenCount: NaN }, exception: InvalidChunkTokenCountException },
    ]

    for (const { name, state: invalidChunkState, exception } of invalidRows) {
      await t.test(name, () => {
        assert.throws(() => ChunkFactory.toChunk(createChunkModel(invalidChunkState)), exception)
      })
    }
  })
})
