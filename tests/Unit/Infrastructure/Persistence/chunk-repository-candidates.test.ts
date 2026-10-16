import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { DataSource, EntityManager } from 'typeorm'

import { Chunk } from '../../../../src/Domain/Chunk/chunk.ts'
import type { ChunkSemanticQueryRowDto } from '../../../../src/Infrastructure/Persistence/Adapters/chunk-search-result.adapter.ts'
import { ReadTransactionDataSourceMismatchException } from '../../../../src/Infrastructure/Persistence/Exceptions/read-transaction-data-source-mismatch.exception.ts'
import { ReadTransactionNotActiveException } from '../../../../src/Infrastructure/Persistence/Exceptions/read-transaction-not-active.exception.ts'
import { ChunkModel } from '../../../../src/Infrastructure/Persistence/Models/chunk.model.ts'
import { PersistenceTransaction } from '../../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { ChunkRepository } from '../../../../src/Infrastructure/Persistence/Repositories/chunk.repository.ts'

const createRetrievalDataSourceStub = (): DataSource =>
  ({
    options: { type: 'postgres', schema: 'chunk_candidate_unit' },
    driver: { version: '17.2', escape: (identifier: string) => `"${identifier}"` },
    isInitialized: true,
  }) as unknown as DataSource

const createCandidateRepository = (dataSource: DataSource) => {
  const persistenceTransaction = new PersistenceTransaction(dataSource, dataSource)

  return {
    persistenceTransaction,
    chunkRepository: new ChunkRepository(persistenceTransaction, dataSource),
  }
}

describe('ChunkRepository vector transaction boundaries', () => {
  it('rejects a foreign manager before executing a query', async () => {
    const { chunkRepository, persistenceTransaction } = createCandidateRepository(createRetrievalDataSourceStub())
    const manager = {
      connection: createRetrievalDataSourceStub(),
      queryRunner: { isTransactionActive: true },
      query: async () => assert.fail('a foreign manager must not execute the vector query'),
    } as unknown as EntityManager

    await assert.rejects(
      persistenceTransaction.bind(manager, () =>
        chunkRepository.findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc({
          documentIndexIds: ['index'],
          queryVector: [1],
          limit: 1,
        }),
      ),
      {
        name: ReadTransactionDataSourceMismatchException.name,
        message: 'Chunk candidate queries require the retrieval DataSource',
        code: 'READ_TRANSACTION_DATA_SOURCE_MISMATCH',
      },
    )
  })

  it('rejects a matching manager without an active transaction before executing a query', async () => {
    const dataSource = createRetrievalDataSourceStub()
    const { chunkRepository, persistenceTransaction } = createCandidateRepository(dataSource)
    const manager = {
      connection: dataSource,
      queryRunner: { isTransactionActive: false },
      query: async () => assert.fail('a manager without an active transaction must not execute the vector query'),
    } as unknown as EntityManager

    await assert.rejects(
      persistenceTransaction.bind(manager, () =>
        chunkRepository.findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc({
          documentIndexIds: ['index'],
          queryVector: [1],
          limit: 1,
        }),
      ),
      ReadTransactionNotActiveException,
    )
  })

  it('keeps scope, vector and limit bound in a single query on the active snapshot manager', async () => {
    const dataSource = createRetrievalDataSourceStub()
    const { chunkRepository, persistenceTransaction } = createCandidateRepository(dataSource)
    const documentIndexIds = Object.freeze(['30000000-0000-4000-8000-000000000001'])
    const queryVector = Object.freeze([0.125, -0.375, 0.625])
    const chunkVectorSimilarityQO = Object.freeze({ documentIndexIds, queryVector, limit: 7 })
    const semanticQueryRowDTO: ChunkSemanticQueryRowDto = {
      id: '20000000-0000-4000-8000-000000000002',
      documentIndexId: documentIndexIds[0]!,
      ordinal: 3,
      headingPath: ['Heading'],
      content: 'orbit',
      blockStart: 4,
      blockEnd: 6,
      tokenCount: null,
      embedding: '[1.25,-2.5,0]',
      searchVector: "'orbit':1",
      createdAt: new Date('2026-10-15T00:00:00.000Z'),
      candidateDistance: '0.25',
    }
    const executedVectorQueries: { sql: string; parameters: unknown[] | undefined }[] = []
    const manager = {
      connection: dataSource,
      queryRunner: { isTransactionActive: true },
      query: async (sql: string, parameters?: unknown[]) => {
        executedVectorQueries.push({ sql, parameters })

        return [semanticQueryRowDTO]
      },
      getRepository: (model: typeof ChunkModel) => {
        assert.equal(model, ChunkModel)

        return {
          metadata: { schema: 'chunk_candidate_unit', tableName: 'rag_chunks' },
          find: () => assert.fail('candidate chunks must not be hydrated by a second query'),
          findBy: () => assert.fail('candidate chunks must not be hydrated by a second query'),
        }
      },
    } as unknown as EntityManager

    const matchedChunks = await persistenceTransaction.bind(manager, () =>
      chunkRepository.findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc(chunkVectorSimilarityQO),
    )

    assert.equal(executedVectorQueries.length, 1)
    const executedVectorQuery = executedVectorQueries[0]!
    assert.deepEqual(executedVectorQuery.parameters, [JSON.stringify(queryVector), documentIndexIds, 7])
    assert.match(executedVectorQuery.sql, /embedding\s*<=>\s*\$1::vector/i)
    assert.match(executedVectorQuery.sql, /WHERE\s+document_index_id\s*=\s*ANY\s*\(\$2::uuid\[\]\)/i)
    assert.match(executedVectorQuery.sql, /ORDER BY\s+"candidateDistance"\s+ASC,\s*(?:"?\w+"?\.)?"?id"?\s+ASC/i)
    assert.match(executedVectorQuery.sql, /LIMIT\s+\$3/i)
    assert.equal(executedVectorQuery.sql.includes(documentIndexIds[0]!), false)
    assert.equal(executedVectorQuery.sql.includes(JSON.stringify(queryVector)), false)
    assert.match(executedVectorQuery.sql, /created_at\s+AS\s+"createdAt"/i)
    assert.equal(matchedChunks.length, 1)
    const matchedChunk = matchedChunks[0]!
    assert.ok(matchedChunk instanceof Chunk)
    assert.deepEqual(
      {
        id: matchedChunk.id,
        documentIndexId: matchedChunk.documentIndexId,
        ordinal: matchedChunk.ordinal,
        headingPath: matchedChunk.headingPath,
        content: matchedChunk.content,
        blockStart: matchedChunk.blockStart,
        blockEnd: matchedChunk.blockEnd,
        tokenCount: matchedChunk.tokenCount,
        embedding: matchedChunk.embedding,
        searchVector: matchedChunk.searchVector,
        createdAt: matchedChunk.createdAt.nativeDate,
      },
      {
        id: semanticQueryRowDTO.id,
        documentIndexId: semanticQueryRowDTO.documentIndexId,
        ordinal: 3,
        headingPath: ['Heading'],
        content: 'orbit',
        blockStart: 4,
        blockEnd: 6,
        tokenCount: null,
        embedding: [1.25, -2.5, 0],
        searchVector: "'orbit':1",
        createdAt: semanticQueryRowDTO.createdAt,
      },
    )
    assert.equal(matchedChunk.vectorCosineDistanceFor(queryVector), 0.25)
    assert.equal(matchedChunk.vectorCosineDistanceFor([1, 0, 0]), null)
    assert.deepEqual(chunkVectorSimilarityQO, { documentIndexIds, queryVector, limit: 7 })
  })

  it('returns empty candidates without a transaction or query when scope, vector or limit is empty', async () => {
    const dataSource = createRetrievalDataSourceStub()
    const { chunkRepository } = createCandidateRepository(dataSource)

    assert.deepEqual(
      await chunkRepository.findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc({
        documentIndexIds: [],
        queryVector: [1],
        limit: 1,
      }),
      [],
    )
    assert.deepEqual(
      await chunkRepository.findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc({
        documentIndexIds: ['index'],
        queryVector: [],
        limit: 1,
      }),
      [],
    )
    assert.deepEqual(
      await chunkRepository.findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc({
        documentIndexIds: ['index'],
        queryVector: [1],
        limit: 0,
      }),
      [],
    )
    assert.deepEqual(
      await chunkRepository.findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc({
        documentIndexIds: ['index'],
        queryVector: [1],
        limit: -1,
      }),
      [],
    )
  })
})
