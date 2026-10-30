import assert from 'node:assert/strict'
import test from 'node:test'

import { createRepositoryStub } from './document-index-lifecycle.fixture.ts'
import type { ChunkRepository } from '../../../src/DocumentIndexes/Application/Ports/Out/Repositories/chunk.repository.ts'
import { LoadRetrievalIndexChunksQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/load-retrieval-index-chunks.query.handler.ts'
import type { ChunkIndexIdsQueryObject } from '../../../src/DocumentIndexes/Application/QueryObjects/chunk.query-object.ts'
import { Chunk } from '../../../src/DocumentIndexes/Domain/Entities/chunk.ts'

const createPersistedChunk = (id: string, documentIndexId: string, ordinal: number): Chunk =>
  new Chunk({
    id,
    documentIndexId,
    ordinal,
    headingPath: ['Heading'],
    content: `Content for ${id}`,
    blockStart: ordinal,
    blockEnd: ordinal + 1,
    tokenCount: null,
    embedding: [0.5, 0.25],
    searchVector: null,
    createdAt: new Date('2026-10-15T00:00:00.000Z'),
  })

test('index loading returns complete entity union while preserving read scopes and repository ordering', async () => {
  const fullContentQueriesQO: ChunkIndexIdsQueryObject[] = []
  const countOnlyQueriesQO: ChunkIndexIdsQueryObject[] = []
  const readEvents: string[] = []
  const firstFullChunk = createPersistedChunk('full-first', 'first-full-index', 0)
  const secondFullChunk = createPersistedChunk('full-second', 'second-full-index', 2)
  const firstCountedChunk = createPersistedChunk('counted-first', 'count-only-index', 1)
  const secondCountedChunk = createPersistedChunk('counted-second', 'count-only-index', 3)
  const fullContentIndexIds = ['second-full-index', 'first-full-index', 'second-full-index']
  const countedIndexIds = ['count-only-index', 'second-full-index', 'count-only-index']
  const chunkRepository = createRepositoryStub<ChunkRepository>({
    findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc: async (chunkIndexIdsQO) => {
      readEvents.push('full-content')
      fullContentQueriesQO.push(chunkIndexIdsQO)

      return [firstFullChunk, secondFullChunk]
    },
    findByDocumentIndexIds: async (chunkIndexIdsQO) => {
      readEvents.push('count-only')
      countOnlyQueriesQO.push(chunkIndexIdsQO)

      return [firstCountedChunk, secondCountedChunk]
    },
  })

  const retrievedChunks = await new LoadRetrievalIndexChunksQueryHandler(chunkRepository).execute({
    fullContentIndexIds,
    countedIndexIds,
  })

  assert.deepEqual(fullContentQueriesQO, [{ documentIndexIds: ['second-full-index', 'first-full-index'] }])
  assert.deepEqual(countOnlyQueriesQO, [{ documentIndexIds: ['count-only-index'] }])
  assert.deepEqual(readEvents, ['full-content', 'count-only'])
  assert.deepEqual(retrievedChunks, [firstFullChunk, secondFullChunk, firstCountedChunk, secondCountedChunk])
  assert.equal(retrievedChunks[0], firstFullChunk)
  assert.equal(retrievedChunks[2], firstCountedChunk)
  assert.ok(retrievedChunks.every((chunk) => chunk instanceof Chunk))
  assert.deepEqual(retrievedChunks[2]!.embedding, [0.5, 0.25])
  assert.equal(retrievedChunks[2]!.searchVector, null)
  assert.deepEqual(retrievedChunks[2]!.createdAt.nativeDate, new Date('2026-10-15T00:00:00.000Z'))
  assert.deepEqual(fullContentIndexIds, ['second-full-index', 'first-full-index', 'second-full-index'])
  assert.deepEqual(countedIndexIds, ['count-only-index', 'second-full-index', 'count-only-index'])
})

test('index loading deduplicates chunk identities and retains the first entity in read order', async () => {
  const firstChunk = createPersistedChunk('same-chunk', 'index', 0)
  const repeatedChunk = createPersistedChunk('same-chunk', 'index', 0)
  const distinctChunk = createPersistedChunk('other-chunk', 'other-index', 0)
  const chunkRepository = createRepositoryStub<ChunkRepository>({
    findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc: async () => [firstChunk, firstChunk],
    findByDocumentIndexIds: async () => [repeatedChunk, distinctChunk, distinctChunk],
  })

  const retrievedChunks = await new LoadRetrievalIndexChunksQueryHandler(chunkRepository).execute({
    fullContentIndexIds: ['index'],
    countedIndexIds: ['other-index'],
  })

  assert.deepEqual(retrievedChunks, [firstChunk, distinctChunk])
  assert.equal(retrievedChunks[0], firstChunk)
  assert.notEqual(retrievedChunks[0], repeatedChunk)
})

test('index loading preserves count-only entities and empty scopes without requesting a full-content index twice', async () => {
  const fullContentQueriesQO: ChunkIndexIdsQueryObject[] = []
  const countOnlyQueriesQO: ChunkIndexIdsQueryObject[] = []
  const countedChunk = createPersistedChunk('counted', 'count-only-index', 0)
  const chunkRepository = createRepositoryStub<ChunkRepository>({
    findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc: async (chunkIndexIdsQO) => {
      fullContentQueriesQO.push(chunkIndexIdsQO)

      return []
    },
    findByDocumentIndexIds: async (chunkIndexIdsQO) => {
      countOnlyQueriesQO.push(chunkIndexIdsQO)

      return chunkIndexIdsQO.documentIndexIds.includes('count-only-index') ? [countedChunk] : []
    },
  })
  const loadRetrievalIndexChunks = new LoadRetrievalIndexChunksQueryHandler(chunkRepository)

  assert.deepEqual(
    await loadRetrievalIndexChunks.execute({ fullContentIndexIds: [], countedIndexIds: ['count-only-index'] }),
    [countedChunk],
  )
  assert.deepEqual(
    await loadRetrievalIndexChunks.execute({ fullContentIndexIds: ['same-index'], countedIndexIds: ['same-index'] }),
    [],
  )
  assert.deepEqual(await loadRetrievalIndexChunks.execute({ fullContentIndexIds: [], countedIndexIds: [] }), [])
  assert.deepEqual(fullContentQueriesQO, [
    { documentIndexIds: [] },
    { documentIndexIds: ['same-index'] },
    { documentIndexIds: [] },
  ])
  assert.deepEqual(countOnlyQueriesQO, [
    { documentIndexIds: ['count-only-index'] },
    { documentIndexIds: [] },
    { documentIndexIds: [] },
  ])
})
