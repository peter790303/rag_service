import assert from 'node:assert/strict'
import test from 'node:test'

import type { DataSource, EntityManager } from 'typeorm'

import type { InsertChunksQO } from '../../../../src/Chunks/Application/QueryObjects/insert-chunks.query-object.ts'
import { Chunk } from '../../../../src/Chunks/Domain/Entities/chunk.ts'
import type { ChunkLexicalQueryRowDTO } from '../../../../src/Chunks/Infrastructure/Persistence/TypeORM/Mappers/chunk-search-result.adapter.ts'
import { ChunkModel } from '../../../../src/Chunks/Infrastructure/Persistence/TypeORM/Models/chunk.model.ts'
import { ChunkRepository } from '../../../../src/Chunks/Infrastructure/Persistence/TypeORM/Repositories/chunk.repository.ts'
import { ReadTransactionDataSourceMismatchException } from '../../../../src/Shared/Infrastructure/Persistence/TypeORM/Exceptions/read-transaction-data-source-mismatch.exception.ts'
import { ReadTransactionNotActiveException } from '../../../../src/Shared/Infrastructure/Persistence/TypeORM/Exceptions/read-transaction-not-active.exception.ts'
import { PersistenceTransaction } from '../../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'

const createRetrievalDataSourceStub = (): DataSource =>
  ({
    options: { type: 'postgres', schema: 'chunk_lexical_unit' },
    driver: { version: '17.2', escape: (identifier: string) => `"${identifier}"` },
    isInitialized: true,
  }) as unknown as DataSource

test('chunk inserts derive the persisted lexical representation from original content without upserting', async () => {
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
  const input = Object.freeze({
    chunks: Object.freeze(
      chunks.map((chunk) =>
        Object.freeze({ ...chunk, unexpectedInternalField: 'excluded', searchVector: 'untrusted' }),
      ),
    ),
  })
  const writes: (InsertChunksQO['chunks'][number] & { searchVector: string })[][] = []
  const manager = {
    getRepository(model: typeof ChunkModel) {
      assert.equal(model, ChunkModel)

      return {
        insert: async (values: (InsertChunksQO['chunks'][number] & { searchVector: string })[]) =>
          void writes.push(values),
        save() {
          assert.fail('new chunks must not overwrite an existing primary key through save')
        },
      }
    },
  } as unknown as EntityManager
  const repository = new ChunkRepository(new PersistenceTransaction({ manager } as DataSource), {} as DataSource)

  await repository.insertChunks(input)
  await repository.insertChunks({ chunks: [] })

  assert.equal(writes.length, 1)
  assert.deepEqual(
    writes[0]?.map((chunk) => chunk.searchVector),
    ["'architecture':1 'boundaries':2", "'繁體':1 '中文':2 'hybrid':3 '檢索':4", ''],
  )
  assert.deepEqual(
    writes[0]?.map((chunk) => ({ ...chunk, searchVector: undefined })),
    chunks.map((chunk) => ({ ...chunk, searchVector: undefined })),
  )
  assert.ok(writes[0]?.every((chunk) => !Object.hasOwn(chunk, 'unexpectedInternalField')))
  assert.ok(chunks.every((chunk) => !Object.hasOwn(chunk, 'searchVector')))
})

test('chunk insertion preserves the original database failure without falling back to save', async () => {
  const duplicateKeyError = Object.assign(new Error('duplicate chunk primary key'), { code: '23505' })
  const manager = {
    getRepository() {
      return {
        async insert() {
          throw duplicateKeyError
        },
        save() {
          assert.fail('a failed chunk insert must not fall back to an overwrite')
        },
      }
    },
  } as unknown as EntityManager
  const repository = new ChunkRepository(new PersistenceTransaction({ manager } as DataSource), {} as DataSource)

  await assert.rejects(
    repository.insertChunks({
      chunks: [
        {
          id: 'existing-chunk',
          documentIndexId: 'index',
          ordinal: 0,
          headingPath: [],
          content: 'replacement',
          blockStart: 0,
          blockEnd: 1,
          tokenCount: null,
          embedding: [1, 0],
          createdAt: new Date('2026-10-16T00:00:00.000Z'),
        },
      ],
    }),
    (error: unknown) => error === duplicateKeyError,
  )
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

test('nonempty scoped lexical queries require the configured retrieval source and active read transaction', async () => {
  const dataSource = createRetrievalDataSourceStub()
  const fallbackManager = {
    getRepository() {
      assert.fail('lexical queries must use the explicitly bound read transaction')
    },
    query() {
      assert.fail('lexical queries must use the explicitly bound read transaction')
    },
  } as unknown as EntityManager
  const persistenceTransaction = new PersistenceTransaction({ manager: fallbackManager } as DataSource, dataSource)
  const repository = new ChunkRepository(persistenceTransaction, dataSource)
  const query = {
    documentIndexIds: ['30000000-0000-4000-8000-000000000001'],
    queryText: '繁體中文 Hybrid 檢索',
    limit: 3,
  }

  const foreignManager = {
    connection: createRetrievalDataSourceStub(),
    queryRunner: { isTransactionActive: true },
    getRepository() {
      assert.fail('a foreign manager must be rejected before opening an ORM repository')
    },
    query() {
      assert.fail('a foreign manager must not execute the lexical query')
    },
  } as unknown as EntityManager
  await assert.rejects(
    persistenceTransaction.bind(foreignManager, () =>
      repository.findByDocumentIndexIdsOrderByLexicalScoreDescAndIdAsc(query),
    ),
    ReadTransactionDataSourceMismatchException,
  )

  const inactiveManager = {
    connection: dataSource,
    queryRunner: { isTransactionActive: false },
    getRepository() {
      assert.fail('an inactive transaction must be rejected before opening an ORM repository')
    },
    query() {
      assert.fail('an inactive transaction must not execute the lexical query')
    },
  } as unknown as EntityManager
  await assert.rejects(
    persistenceTransaction.bind(inactiveManager, () =>
      repository.findByDocumentIndexIdsOrderByLexicalScoreDescAndIdAsc(query),
    ),
    ReadTransactionNotActiveException,
  )
})

test('lexical candidates keep matching, ranking, stable ordering, limit and hydration in the active read snapshot', async () => {
  const dataSource = createRetrievalDataSourceStub()
  const fallbackManager = {
    getRepository() {
      assert.fail('lexical candidates must use the explicitly bound snapshot manager')
    },
    query() {
      assert.fail('lexical candidates must use the explicitly bound snapshot manager')
    },
  } as unknown as EntityManager
  const persistenceTransaction = new PersistenceTransaction({ manager: fallbackManager } as DataSource, dataSource)
  const repository = new ChunkRepository(persistenceTransaction, dataSource)
  const documentIndexIds = Object.freeze([
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
  ])
  const queryText = '繁體中文 Hybrid 檢索'
  const query = Object.freeze({ documentIndexIds, queryText, limit: 7 })
  const lexicalRow: ChunkLexicalQueryRowDTO = {
    id: '20000000-0000-4000-8000-000000000002',
    documentIndexId: documentIndexIds[0]!,
    ordinal: 3,
    headingPath: ['章節', 'Hybrid'],
    content: '繁體中文 Hybrid 檢索內容',
    blockStart: 4,
    blockEnd: 6,
    tokenCount: 9,
    embedding: '[1.25,-2.5,0]',
    searchVector: "'hybrid':1 '檢索':2",
    createdAt: new Date('2026-10-15T00:00:00.000Z'),
    lexicalScore: '0.625',
  }
  const executedQueries: { sql: string; parameters: unknown[] | undefined; manager: EntityManager }[] = []
  const manager = {
    connection: dataSource,
    queryRunner: { isTransactionActive: true },
    query: async (sql: string, parameters?: unknown[]) => {
      executedQueries.push({ sql, parameters, manager })

      return [lexicalRow]
    },
    getRepository: (model: typeof ChunkModel) => {
      assert.equal(model, ChunkModel)

      return {
        metadata: { schema: 'chunk_lexical_unit', tableName: 'rag_chunks' },
        find: () => assert.fail('lexical result rows must hydrate chunks without a second query'),
        findBy: () => assert.fail('lexical result rows must hydrate chunks without a second query'),
      }
    },
  } as unknown as EntityManager

  const chunks = await persistenceTransaction.bind(manager, () =>
    repository.findByDocumentIndexIdsOrderByLexicalScoreDescAndIdAsc(query),
  )

  assert.equal(executedQueries.length, 1)
  const executedQuery = executedQueries[0]!
  assert.equal(executedQuery.manager, manager)
  assert.deepEqual(executedQuery.parameters, ['繁體 中文 hybrid 檢索', documentIndexIds, 7])
  assert.match(executedQuery.sql, /FROM "chunk_lexical_unit"\."rag_chunks"/i)
  assert.match(executedQuery.sql, /document_index_id\s*=\s*ANY\s*\(\$2::uuid\[\]\)/i)
  assert.match(executedQuery.sql, /search_vector\s*@@\s*plainto_tsquery\('simple',\s*\$1\)/i)
  assert.match(
    executedQuery.sql,
    /ts_rank\(search_vector,\s*plainto_tsquery\('simple',\s*\$1\)\)\s+AS\s+"lexicalScore"/i,
  )
  assert.match(executedQuery.sql, /ORDER BY\s+"lexicalScore"\s+DESC,\s*id\s+ASC/i)
  assert.match(executedQuery.sql, /LIMIT\s+\$3/i)
  assert.equal(executedQuery.sql.includes(documentIndexIds[0]!), false)
  assert.equal(executedQuery.sql.includes(queryText), false)

  assert.equal(chunks.length, 1)
  const chunk = chunks[0]!
  assert.ok(chunk instanceof Chunk)
  assert.deepEqual(
    {
      id: chunk.id,
      documentIndexId: chunk.documentIndexId,
      ordinal: chunk.ordinal,
      headingPath: chunk.headingPath,
      content: chunk.content,
      blockStart: chunk.blockStart,
      blockEnd: chunk.blockEnd,
      tokenCount: chunk.tokenCount,
      embedding: chunk.embedding,
      searchVector: chunk.searchVector,
      createdAt: chunk.createdAt.nativeDate,
    },
    {
      id: lexicalRow.id,
      documentIndexId: lexicalRow.documentIndexId,
      ordinal: lexicalRow.ordinal,
      headingPath: lexicalRow.headingPath,
      content: lexicalRow.content,
      blockStart: lexicalRow.blockStart,
      blockEnd: lexicalRow.blockEnd,
      tokenCount: lexicalRow.tokenCount,
      embedding: [1.25, -2.5, 0],
      searchVector: lexicalRow.searchVector,
      createdAt: lexicalRow.createdAt,
    },
  )
  assert.equal(chunk.requireLexicalSearchScoreFor(queryText), 0.625)
  assert.deepEqual(query, { documentIndexIds, queryText, limit: 7 })
})
