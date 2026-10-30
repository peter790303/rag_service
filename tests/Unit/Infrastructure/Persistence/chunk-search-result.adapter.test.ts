import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Chunk } from '../../../../src/DocumentIndexes/Domain/Entities/chunk.ts'
import { InvalidChunkEmbeddingException } from '../../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Exceptions/invalid-chunk-embedding.exception.ts'
import { ChunkSearchResultAdapter } from '../../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Mappers/chunk-search-result.adapter.ts'
import type { ChunkSemanticQueryRowDTO } from '../../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Mappers/chunk-search-result.adapter.ts'

const queryVector = Object.freeze([1, 0, 0])
const createSemanticQueryRowDTO = (embedding: string | number[]): ChunkSemanticQueryRowDTO => ({
  id: '20000000-0000-4000-8000-000000000002',
  documentIndexId: '30000000-0000-4000-8000-000000000001',
  ordinal: 3,
  headingPath: ['Heading'],
  content: 'orbit',
  blockStart: 4,
  blockEnd: 6,
  tokenCount: null,
  embedding,
  searchVector: "'orbit':1",
  createdAt: '2026-10-15T00:00:00.000Z',
  candidateDistance: '0.25',
})

test('candidate adapters restore complete Chunk entities from pgvector wire text and database measurements', () => {
  const semanticQueryRowDTO = createSemanticQueryRowDTO('[1.25,-2.5,0]')
  const [matchedChunk] = ChunkSearchResultAdapter.toVectorMatchedChunks([semanticQueryRowDTO], queryVector)

  assert.ok(matchedChunk instanceof Chunk)
  assert.equal(matchedChunk.id, semanticQueryRowDTO.id)
  assert.equal(matchedChunk.documentIndexId, semanticQueryRowDTO.documentIndexId)
  assert.equal(matchedChunk.ordinal, 3)
  assert.deepEqual(matchedChunk.headingPath, ['Heading'])
  assert.equal(matchedChunk.content, 'orbit')
  assert.equal(matchedChunk.blockStart, 4)
  assert.equal(matchedChunk.blockEnd, 6)
  assert.equal(matchedChunk.tokenCount, null)
  assert.deepEqual(matchedChunk.embedding, [1.25, -2.5, 0])
  assert.equal(matchedChunk.searchVector, "'orbit':1")
  assert.deepEqual(matchedChunk.createdAt.nativeDate, new Date(semanticQueryRowDTO.createdAt))
  assert.equal(matchedChunk.vectorCosineDistanceFor(queryVector), 0.25)
  assert.equal(matchedChunk.vectorCosineDistanceFor([0, 1, 0]), null)
  assert.equal(semanticQueryRowDTO.embedding, '[1.25,-2.5,0]')
  assert.equal(semanticQueryRowDTO.candidateDistance, '0.25')
})

test('candidate adapters preserve database order and distance without computing from embeddings', () => {
  const rows = [
    { ...createSemanticQueryRowDTO([0, 1, 0]), id: 'first', candidateDistance: '0.12500000000000003' },
    { ...createSemanticQueryRowDTO([1, 0, 0]), id: 'second', candidateDistance: '0.75' },
  ]
  const matchedChunks = ChunkSearchResultAdapter.toVectorMatchedChunks(rows, queryVector)

  assert.deepEqual(
    matchedChunks.map((chunk) => chunk.id),
    ['first', 'second'],
  )
  assert.deepEqual(
    matchedChunks.map((chunk) => chunk.vectorCosineDistanceFor(queryVector)),
    [0.12500000000000003, 0.75],
  )
})

test('candidate adapters accept numeric vectors and retain an empty search vector', () => {
  const semanticQueryRowDTO = { ...createSemanticQueryRowDTO([0, -0.5, 1]), searchVector: '' }
  const [matchedChunk] = ChunkSearchResultAdapter.toVectorMatchedChunks([semanticQueryRowDTO], queryVector)

  assert.ok(matchedChunk)
  assert.deepEqual(matchedChunk.embedding, [0, -0.5, 1])
  assert.equal(matchedChunk.searchVector, '')
})

test('candidate adapters preserve null search vectors', () => {
  const semanticQueryRowDTO = { ...createSemanticQueryRowDTO([1]), searchVector: null }
  const [matchedChunk] = ChunkSearchResultAdapter.toVectorMatchedChunks([semanticQueryRowDTO], queryVector)

  assert.ok(matchedChunk)
  assert.equal(matchedChunk.searchVector, null)
})

test('candidate adapters reject malformed wire representations rather than substitute a vector', () => {
  const testCases = ['{"coordinate":1}', '[1,"invalid"]', '[1,1e309]', '[1']
  testCases.forEach((embedding) => {
    assert.throws(
      () => ChunkSearchResultAdapter.toVectorMatchedChunks([createSemanticQueryRowDTO(embedding)], queryVector),
      InvalidChunkEmbeddingException,
    )
  })
})

test('semantic candidate restoration preserves source spans, nullable tokens and isolated headings', () => {
  const semanticQueryRowDTO = {
    ...createSemanticQueryRowDTO('[1]'),
    content: '  中文\r\nbody\n',
    headingPath: ['Title', '中文'],
    blockStart: 0,
    blockEnd: 2,
  }
  const originalSemanticQueryRowDTO = structuredClone(semanticQueryRowDTO)
  const [matchedChunk] = ChunkSearchResultAdapter.toVectorMatchedChunks([semanticQueryRowDTO], queryVector)

  assert.ok(matchedChunk instanceof Chunk)
  assert.equal(matchedChunk.content, '  中文\r\nbody\n')
  assert.deepEqual(matchedChunk.headingPath, ['Title', '中文'])
  assert.equal(matchedChunk.blockStart, 0)
  assert.equal(matchedChunk.blockEnd, 2)
  assert.equal(matchedChunk.tokenCount, null)
  assert.equal(matchedChunk.vectorCosineDistanceFor(queryVector), 0.25)
  assert.deepEqual(semanticQueryRowDTO, originalSemanticQueryRowDTO)
  matchedChunk.headingPath.push('Changed output')
  assert.deepEqual(semanticQueryRowDTO.headingPath, ['Title', '中文'])
})

test('vector bind parameters preserve coordinate order, signs and precision without changing the input', () => {
  const vector = Object.freeze([1.25, -2.5, 0, 0.000001])

  assert.equal(ChunkSearchResultAdapter.toVectorParameter(vector), '[1.25,-2.5,0,0.000001]')
  assert.deepEqual(vector, [1.25, -2.5, 0, 0.000001])
})
