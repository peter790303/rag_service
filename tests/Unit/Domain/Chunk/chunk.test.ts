import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { Chunk } from '../../../../src/Domain/Chunk/chunk.ts'
import { ChunkDocumentIndexMismatchException } from '../../../../src/Domain/Chunk/Exceptions/chunk-document-index-mismatch.exception.ts'
import { ChunkDocumentIndexRequiredException } from '../../../../src/Domain/Chunk/Exceptions/chunk-document-index-required.exception.ts'
import { ChunkIdentityRequiredException } from '../../../../src/Domain/Chunk/Exceptions/chunk-identity-required.exception.ts'
import { ChunkLexicalSearchMatchMissingException } from '../../../../src/Domain/Chunk/Exceptions/chunk-lexical-search-match-missing.exception.ts'
import { ChunkRetrievalMatchMissingException } from '../../../../src/Domain/Chunk/Exceptions/chunk-retrieval-match-missing.exception.ts'
import { ChunkSourceSpanReversedException } from '../../../../src/Domain/Chunk/Exceptions/chunk-source-span-reversed.exception.ts'
import { ChunkVectorSearchMatchMissingException } from '../../../../src/Domain/Chunk/Exceptions/chunk-vector-search-match-missing.exception.ts'
import { InvalidChunkBlockEndException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-block-end.exception.ts'
import { InvalidChunkBlockStartException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-block-start.exception.ts'
import { InvalidChunkContentException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-content.exception.ts'
import { InvalidChunkCreatedAtException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-created-at.exception.ts'
import { InvalidChunkEmbeddingException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-embedding.exception.ts'
import { InvalidChunkHeadingPathException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-heading-path.exception.ts'
import { InvalidChunkLexicalSearchMatchException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-lexical-search-match.exception.ts'
import { InvalidChunkOrdinalException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-ordinal.exception.ts'
import { InvalidChunkRetrievalMatchException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-retrieval-match.exception.ts'
import { InvalidChunkSearchVectorException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-search-vector.exception.ts'
import { InvalidChunkTokenCountException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-token-count.exception.ts'
import { InvalidChunkVectorSearchMatchException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-vector-search-match.exception.ts'

type ChunkState = ConstructorParameters<typeof Chunk>[0]

const createChunkState = (chunkStateOverrides: Partial<ChunkState> = {}): ChunkState => ({
  id: 'chunk-1',
  documentIndexId: 'index-1',
  ordinal: 2,
  headingPath: ['Overview', '中文標題'],
  content: '  unchanged indentation\r\n中文內容\n',
  blockStart: 3,
  blockEnd: 7,
  tokenCount: 4,
  embedding: [0.25, 0.75],
  searchVector: "'answer':1",
  createdAt: new Date('2026-10-14T00:00:00.000Z'),
  ...chunkStateOverrides,
})

describe('Chunk', () => {
  it('preserves the identity, index ownership and original content of a valid chunk', () => {
    const chunkState = createChunkState()
    const chunk = new Chunk(chunkState)

    assert.equal(chunk.id, chunkState.id)
    assert.equal(chunk.documentIndexId, chunkState.documentIndexId)
    assert.equal(chunk.ordinal, chunkState.ordinal)
    assert.deepEqual(chunk.headingPath, chunkState.headingPath)
    assert.equal(chunk.content, chunkState.content)
    assert.equal(chunk.blockStart, chunkState.blockStart)
    assert.equal(chunk.blockEnd, chunkState.blockEnd)
    assert.equal(chunk.tokenCount, chunkState.tokenCount)
    assert.doesNotThrow(() => chunk.assertBelongsToDocumentIndex(chunkState.documentIndexId))
  })

  it('accepts the existing empty-content, zero-range and nullable-token boundaries', () => {
    const chunk = new Chunk(
      createChunkState({ ordinal: 0, headingPath: [], content: '', blockStart: 0, blockEnd: 0, tokenCount: null }),
    )
    const zeroTokenChunk = new Chunk(createChunkState({ tokenCount: 0 }))

    assert.equal(chunk.content, '')
    assert.deepEqual(chunk.headingPath, [])
    assert.equal(chunk.ordinal, 0)
    assert.equal(chunk.blockStart, 0)
    assert.equal(chunk.blockEnd, 0)
    assert.equal(chunk.tokenCount, null)
    assert.equal(zeroTokenChunk.tokenCount, 0)
  })

  it('keeps heading ownership when the constructor input or a returned heading path is changed', () => {
    const headingPath = ['Original']
    const chunk = new Chunk(createChunkState({ headingPath }))
    headingPath[0] = 'Changed input'
    headingPath.push('Added input')

    assert.deepEqual(chunk.headingPath, ['Original'])
    const returnedHeadingPath = chunk.headingPath
    returnedHeadingPath[0] = 'Changed output'
    returnedHeadingPath.push('Added output')

    assert.deepEqual(chunk.headingPath, ['Original'])
  })

  it('rejects sparse heading paths and embeddings before persistence can turn holes into null values', () => {
    const headingPath = new Array<string>(2)
    headingPath[1] = 'Second-level heading'
    const embedding = new Array<number>(2)
    embedding[1] = 0.75

    assert.throws(() => new Chunk(createChunkState({ headingPath })), InvalidChunkHeadingPathException)
    assert.throws(() => new Chunk(createChunkState({ embedding })), InvalidChunkEmbeddingException)
  })

  it('owns the complete persisted embedding and creation time defensively', () => {
    const state = createChunkState()
    const chunk = new Chunk(state)
    const originalTime = state.createdAt.getTime()
    ;(state.embedding as number[])[0] = 99
    state.createdAt.setTime(0)
    chunk.embedding[0] = 100
    chunk.createdAt.setTime(1)

    assert.deepEqual(chunk.embedding, [0.25, 0.75])
    assert.equal(chunk.createdAt.getTime(), originalTime)
    assert.equal(chunk.searchVector, "'answer':1")
  })

  it('keeps database distance tied to the exact query without recalculating it', () => {
    const chunk = new Chunk(createChunkState())
    const queryVector = [0.2, 0.8]
    const databaseDistance = 0.1234567890123456
    assert.equal(chunk.vectorCosineDistanceFor(queryVector), null)
    assert.throws(() => chunk.requireVectorCosineDistanceFor(queryVector), ChunkVectorSearchMatchMissingException)

    chunk.recordVectorSearchMatch(queryVector, databaseDistance)
    queryVector[0] = 0.9
    assert.equal(chunk.vectorCosineDistanceFor(queryVector), null)
    assert.equal(chunk.requireVectorCosineDistanceFor([0.2, 0.8]), databaseDistance)
    assert.equal(chunk.vectorCosineDistanceFor([0.2]), null)

    chunk.recordVectorSearchMatch([1, 0], 0)
    assert.equal(chunk.vectorCosineDistanceFor([0.2, 0.8]), null)
    assert.equal(chunk.requireVectorCosineDistanceFor([1, 0]), 0)
  })

  it('rejects invalid persisted search state and non-finite database distances', () => {
    assert.throws(() => new Chunk(createChunkState({ embedding: [NaN] })), InvalidChunkEmbeddingException)
    assert.throws(() => new Chunk(createChunkState({ createdAt: new Date(NaN) })), InvalidChunkCreatedAtException)
    assert.throws(
      () => new Chunk(createChunkState({ searchVector: undefined as unknown as string })),
      InvalidChunkSearchVectorException,
    )
    const chunk = new Chunk(createChunkState())
    assert.throws(() => chunk.recordVectorSearchMatch([], 0), InvalidChunkVectorSearchMatchException)
    assert.throws(() => chunk.recordVectorSearchMatch([Infinity], 0), InvalidChunkVectorSearchMatchException)
    assert.throws(() => chunk.recordVectorSearchMatch([1], NaN), InvalidChunkVectorSearchMatchException)
  })

  it('requires a search vector for indexing while preserving nullable read state and empty vectors', () => {
    const withoutSearchVector: Chunk = new Chunk(createChunkState({ searchVector: null }))
    const emptySearchVector: Chunk = new Chunk(createChunkState({ searchVector: '' }))

    assert.equal(withoutSearchVector.searchVector, null)
    assert.throws(() => withoutSearchVector.assertHasSearchVector(), InvalidChunkSearchVectorException)
    emptySearchVector.assertHasSearchVector()
    assert.equal(emptySearchVector.searchVector, '')
  })

  it('ties lexical evidence to the original query text and clears stale retrieval ranks when evidence changes', () => {
    const chunk = new Chunk(createChunkState())
    const queryText = 'Release deployments'
    assert.throws(() => chunk.requireLexicalSearchScoreFor(queryText), ChunkLexicalSearchMatchMissingException)
    assert.throws(() => chunk.requireRetrievalMatch(), ChunkRetrievalMatchMissingException)
    chunk.recordLexicalSearchMatch(queryText, 0)

    assert.throws(
      () => chunk.requireLexicalSearchScoreFor('release deployments'),
      ChunkLexicalSearchMatchMissingException,
    )
    assert.throws(
      () => chunk.requireLexicalSearchScoreFor('deployments Release'),
      ChunkLexicalSearchMatchMissingException,
    )
    assert.equal(chunk.requireLexicalSearchScoreFor(queryText), 0)
    chunk.recordVectorSearchMatch([1, 0], -Number.EPSILON)
    chunk.recordRetrievalMatch([1, 0], queryText, 2, 3)
    assert.deepEqual(
      { ...chunk.requireRetrievalMatch() },
      {
        semanticScore: 1 + Number.EPSILON,
        lexicalScore: 0,
        semanticRank: 2,
        lexicalRank: 3,
      },
    )

    chunk.recordLexicalSearchMatch('release', 0.7)
    assert.equal(chunk.retrievalMatch, null)
    assert.throws(() => chunk.requireRetrievalMatch(), ChunkRetrievalMatchMissingException)
    chunk.recordRetrievalMatch([], 'release', null, 1)
    assert.equal(chunk.requireRetrievalMatch().semanticRank, null)
    assert.equal(chunk.requireRetrievalMatch().lexicalScore, 0.7)
    chunk.recordVectorSearchMatch([0, 1], 0.2)
    assert.equal(chunk.retrievalMatch, null)
  })

  it('rejects missing query evidence and invalid channel ranks instead of inventing scores', () => {
    const chunk = new Chunk(createChunkState())
    assert.throws(() => chunk.recordRetrievalMatch([1], 'release', 1, null), ChunkVectorSearchMatchMissingException)
    assert.throws(() => chunk.recordRetrievalMatch([], 'release', null, 1), ChunkLexicalSearchMatchMissingException)
    assert.throws(() => chunk.recordLexicalSearchMatch('', 1), InvalidChunkLexicalSearchMatchException)
    assert.throws(() => chunk.recordLexicalSearchMatch(' ', 1), InvalidChunkLexicalSearchMatchException)
    assert.throws(() => chunk.recordLexicalSearchMatch('release', Infinity), InvalidChunkLexicalSearchMatchException)
    chunk.recordLexicalSearchMatch('release', 0.3)
    assert.throws(() => chunk.recordRetrievalMatch([], 'release', null, 0), InvalidChunkRetrievalMatchException)
    assert.throws(() => chunk.recordRetrievalMatch([], 'release', null, 1.5), InvalidChunkRetrievalMatchException)
    assert.throws(() => chunk.recordRetrievalMatch([], 'release', null, null), InvalidChunkRetrievalMatchException)
    assert.equal(chunk.retrievalMatch, null)
  })

  it('rejects using a chunk under another document index', () => {
    const chunk = new Chunk(createChunkState())

    assert.throws(() => chunk.assertBelongsToDocumentIndex('another-index'), ChunkDocumentIndexMismatchException)
    assert.equal(chunk.documentIndexId, 'index-1')
  })

  it('rejects invalid identity, content, heading, ordinal, source range and token state', async (t) => {
    const invalidStates: readonly { name: string; state: Partial<ChunkState>; exception: new () => Error }[] = [
      { name: 'empty identity', state: { id: '' }, exception: ChunkIdentityRequiredException },
      { name: 'blank identity', state: { id: '  ' }, exception: ChunkIdentityRequiredException },
      { name: 'empty owner', state: { documentIndexId: '' }, exception: ChunkDocumentIndexRequiredException },
      { name: 'blank owner', state: { documentIndexId: '  ' }, exception: ChunkDocumentIndexRequiredException },
      { name: 'negative ordinal', state: { ordinal: -1 }, exception: InvalidChunkOrdinalException },
      { name: 'fractional ordinal', state: { ordinal: 0.5 }, exception: InvalidChunkOrdinalException },
      { name: 'non-finite ordinal', state: { ordinal: Infinity }, exception: InvalidChunkOrdinalException },
      { name: 'missing ordinal', state: { ordinal: NaN }, exception: InvalidChunkOrdinalException },
      {
        name: 'invalid content',
        state: { content: null as unknown as string },
        exception: InvalidChunkContentException,
      },
      {
        name: 'invalid heading array',
        state: { headingPath: null as unknown as string[] },
        exception: InvalidChunkHeadingPathException,
      },
      {
        name: 'invalid heading entry',
        state: { headingPath: ['Heading', 1] as unknown as string[] },
        exception: InvalidChunkHeadingPathException,
      },
      { name: 'negative source start', state: { blockStart: -1 }, exception: InvalidChunkBlockStartException },
      { name: 'fractional source start', state: { blockStart: 0.5 }, exception: InvalidChunkBlockStartException },
      { name: 'non-finite source start', state: { blockStart: NaN }, exception: InvalidChunkBlockStartException },
      {
        name: 'source end before start',
        state: { blockStart: 3, blockEnd: 2 },
        exception: ChunkSourceSpanReversedException,
      },
      { name: 'negative source end', state: { blockStart: 0, blockEnd: -1 }, exception: InvalidChunkBlockEndException },
      { name: 'fractional source end', state: { blockEnd: 7.5 }, exception: InvalidChunkBlockEndException },
      { name: 'non-finite source end', state: { blockEnd: Infinity }, exception: InvalidChunkBlockEndException },
      { name: 'negative token count', state: { tokenCount: -1 }, exception: InvalidChunkTokenCountException },
      { name: 'fractional token count', state: { tokenCount: 0.5 }, exception: InvalidChunkTokenCountException },
      { name: 'non-finite token count', state: { tokenCount: NaN }, exception: InvalidChunkTokenCountException },
    ]

    for (const { name, state: invalidChunkState, exception } of invalidStates) {
      await t.test(name, () => {
        assert.throws(() => new Chunk(createChunkState(invalidChunkState)), exception)
      })
    }
  })
})
