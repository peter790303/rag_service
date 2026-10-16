import assert from 'node:assert/strict'
import test from 'node:test'

import { createRepositoryStub } from './document-index-lifecycle.fixture.ts'
import type { ChunkRepository } from '../../../src/Application/Chunks/Contracts/chunk.repository.ts'
import type { ChunkIndexOrdinalsQueryObject } from '../../../src/Application/Chunks/QueryObjects/chunk.query-object.ts'
import { LoadRetrievalChunkContextUseCase } from '../../../src/Application/Chunks/UseCases/load-retrieval-chunk-context.use-case.ts'
import { Chunk } from '../../../src/Domain/Chunk/chunk.ts'

const createCandidateChunk = (id: string, documentIndexId: string, ordinal: number): Chunk =>
  new Chunk({
    id,
    documentIndexId,
    ordinal,
    headingPath: [],
    content: id,
    tokenCount: null,
    embedding: [],
    searchVector: null,
    blockStart: ordinal,
    blockEnd: ordinal,
    createdAt: new Date(0),
  })

test('neighbor queries omit negative ordinals, deduplicate overlaps, group indexes and return repository entities', async () => {
  const neighborQueriesQO: ChunkIndexOrdinalsQueryObject[] = []
  const neighboringChunk = new Chunk({
    id: 'neighbor',
    documentIndexId: 'first-index',
    ordinal: 1,
    headingPath: ['Heading'],
    content: 'context',
    tokenCount: 2,
    blockStart: 1,
    blockEnd: 2,
    embedding: [0.5],
    searchVector: 'context',
    createdAt: new Date(0),
  })
  const chunkRepository = createRepositoryStub<ChunkRepository>({
    findByDocumentIndexIdAndOrdinals: async (chunkIndexOrdinalsQO) => {
      neighborQueriesQO.push(chunkIndexOrdinalsQO)

      return chunkIndexOrdinalsQO.documentIndexId === 'first-index' ? [neighboringChunk] : []
    },
  })
  const retrievedChunks = await new LoadRetrievalChunkContextUseCase(chunkRepository).execute({
    candidates: [
      createCandidateChunk('zero', 'first-index', 0),
      createCandidateChunk('zero', 'first-index', 0),
      createCandidateChunk('two', 'first-index', 2),
      createCandidateChunk('other', 'second-index', 1),
      createCandidateChunk('non-root', 'first-index', 20),
      createCandidateChunk('inactive', 'inactive-index', 5),
    ],
    rootChunkIds: ['zero', 'two', 'other', 'inactive'],
    activeDocumentIndexIds: ['first-index', 'second-index'],
  })

  assert.deepEqual(neighborQueriesQO, [
    { documentIndexId: 'first-index', ordinals: [1, 3] },
    { documentIndexId: 'second-index', ordinals: [0, 2] },
  ])
  assert.deepEqual(retrievedChunks, [neighboringChunk])
  assert.equal(retrievedChunks[0], neighboringChunk)
  assert.ok(retrievedChunks[0] instanceof Chunk)
  assert.equal(retrievedChunks[0].searchVector, 'context')
  assert.deepEqual(retrievedChunks[0].createdAt.nativeDate, new Date(0))
})

test('neighbor ordinal deduplication preserves the same ordinal in distinct indexes', async () => {
  const neighborQueriesQO: ChunkIndexOrdinalsQueryObject[] = []
  const chunkRepository = createRepositoryStub<ChunkRepository>({
    findByDocumentIndexIdAndOrdinals: async (chunkIndexOrdinalsQO) => {
      neighborQueriesQO.push(chunkIndexOrdinalsQO)

      return [
        new Chunk({
          id: `${chunkIndexOrdinalsQO.documentIndexId}-neighbor`,
          documentIndexId: chunkIndexOrdinalsQO.documentIndexId,
          ordinal: 1,
          headingPath: [],
          content: chunkIndexOrdinalsQO.documentIndexId,
          tokenCount: null,
          blockStart: 1,
          blockEnd: 1,
          embedding: [],
          searchVector: null,
          createdAt: new Date(0),
        }),
      ]
    },
  })

  const neighboringChunks = await new LoadRetrievalChunkContextUseCase(chunkRepository).execute({
    candidates: [
      createCandidateChunk('first-root', 'first-index', 0),
      createCandidateChunk('first-root', 'first-index', 0),
      createCandidateChunk('second-root', 'second-index', 0),
    ],
    rootChunkIds: ['first-root', 'second-root'],
    activeDocumentIndexIds: ['first-index', 'second-index'],
  })

  assert.deepEqual(neighborQueriesQO, [
    { documentIndexId: 'first-index', ordinals: [1] },
    { documentIndexId: 'second-index', ordinals: [1] },
  ])
  assert.deepEqual(
    neighboringChunks.map(({ id, documentIndexId, ordinal }) => ({ id, documentIndexId, ordinal })),
    [
      { id: 'first-index-neighbor', documentIndexId: 'first-index', ordinal: 1 },
      { id: 'second-index-neighbor', documentIndexId: 'second-index', ordinal: 1 },
    ],
  )
})

test('empty candidates, absent roots and inactive indexes do not issue neighbor queries', async () => {
  const chunkRepository = createRepositoryStub<ChunkRepository>({
    findByDocumentIndexIdAndOrdinals: async () => assert.fail('no eligible neighbor query'),
  })
  const loadRetrievalChunkContext = new LoadRetrievalChunkContextUseCase(chunkRepository)
  const candidateChunk = createCandidateChunk('root', 'index', 0)

  assert.deepEqual(
    await loadRetrievalChunkContext.execute({
      candidates: [],
      rootChunkIds: ['root'],
      activeDocumentIndexIds: ['index'],
    }),
    [],
  )
  assert.deepEqual(
    await loadRetrievalChunkContext.execute({
      candidates: [candidateChunk],
      rootChunkIds: [],
      activeDocumentIndexIds: ['index'],
    }),
    [],
  )
  assert.deepEqual(
    await loadRetrievalChunkContext.execute({
      candidates: [candidateChunk],
      rootChunkIds: ['root'],
      activeDocumentIndexIds: [],
    }),
    [],
  )
})
