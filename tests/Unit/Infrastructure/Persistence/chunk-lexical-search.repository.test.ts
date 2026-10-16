import assert from 'node:assert/strict'
import test from 'node:test'

import type { DataSource, EntityManager } from 'typeorm'

import { LexicalRankingUnavailableException } from '../../../../src/Application/Chunks/Exceptions/lexical-ranking-unavailable.exception.ts'
import type { SaveChunksQueryObject } from '../../../../src/Application/Chunks/QueryObjects/save-chunks.query-object.ts'
import { ChunkModel } from '../../../../src/Infrastructure/Persistence/Models/chunk.model.ts'
import { PersistenceTransaction } from '../../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { ChunkRepository } from '../../../../src/Infrastructure/Persistence/Repositories/chunk.repository.ts'

test('chunk writes derive the persisted lexical representation from original content', async () => {
  const chunks = ['Architecture BOUNDARIES', '繁體中文 Hybrid 檢索', '，。！？ --'].map((content, ordinal) =>
    Object.freeze({
      id: `chunk-${ordinal}`,
      documentIndexId: 'index',
      ordinal,
      headingPath: [],
      content,
      blockStart: ordinal,
      blockEnd: ordinal,
      tokenCount: null,
      embedding: [1, 0],
      createdAt: new Date('2026-10-16T00:00:00.000Z'),
    }),
  )
  const input = Object.freeze({ chunks: Object.freeze(chunks) })
  const writes: (SaveChunksQueryObject['chunks'][number] & { searchVector: string })[][] = []
  const manager = {
    getRepository(model: typeof ChunkModel) {
      assert.equal(model, ChunkModel)

      return {
        save: async (values: (SaveChunksQueryObject['chunks'][number] & { searchVector: string })[]) =>
          void writes.push(values),
      }
    },
  } as unknown as EntityManager
  const repository = new ChunkRepository(new PersistenceTransaction({ manager } as DataSource), {} as DataSource)

  await repository.saveChunks(input)
  await repository.saveChunks({ chunks: [] })

  assert.equal(writes.length, 1)
  assert.deepEqual(
    writes[0]?.map((chunk) => chunk.searchVector),
    ['architecture boundaries', '繁體 中文 hybrid 檢索', ''],
  )
  assert.deepEqual(
    writes[0]?.map((chunk) => ({ ...chunk, searchVector: undefined })),
    chunks.map((chunk) => ({ ...chunk, searchVector: undefined })),
  )
  assert.ok(chunks.every((chunk) => !Object.hasOwn(chunk, 'searchVector')))
})

test('lexical queries short-circuit absent scope, nonpositive limits and text without words before database access', async () => {
  const manager = {
    getRepository() {
      assert.fail('lexical short circuits must not open an ORM repository')
    },
    query() {
      assert.fail('lexical short circuits must not query the database')
    },
  } as unknown as EntityManager
  const repository = new ChunkRepository(new PersistenceTransaction({ manager } as DataSource), {} as DataSource)
  const query = { documentIndexIds: Object.freeze(['index']), queryText: 'WORDS', limit: 3 }
  const inputs = [
    { ...query, documentIndexIds: [] },
    { ...query, limit: 0 },
    { ...query, limit: -1 },
    { ...query, queryText: '' },
    { ...query, queryText: '   \n\t' },
    { ...query, queryText: '，。！？ --' },
  ]

  const results = await Promise.all(
    inputs.map((input) => repository.findByDocumentIndexIdsOrderByLexicalScoreDescAndIdAsc(input)),
  )

  assert.ok(results.every((result) => result.length === 0))
  assert.deepEqual(query, { documentIndexIds: ['index'], queryText: 'WORDS', limit: 3 })
})

test('nonempty scoped lexical queries remain explicitly blocked without executing unapproved SQL', async () => {
  const manager = {
    getRepository() {
      assert.fail('blocked lexical ranking must not open an ORM repository')
    },
    query() {
      assert.fail('blocked lexical ranking must not execute SQL')
    },
  } as unknown as EntityManager
  const repository = new ChunkRepository(new PersistenceTransaction({ manager } as DataSource), {} as DataSource)

  await assert.rejects(
    repository.findByDocumentIndexIdsOrderByLexicalScoreDescAndIdAsc({
      documentIndexIds: ['index'],
      queryText: '繁體中文 Hybrid 檢索',
      limit: 3,
    }),
    LexicalRankingUnavailableException,
  )
})
