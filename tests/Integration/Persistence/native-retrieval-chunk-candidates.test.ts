import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { DataSource, EntityManager } from 'typeorm'

import type { FindLexicalChunkCandidatesDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/find-lexical-chunk-candidates.dto.ts'
import { FindLexicalChunkCandidatesQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/find-lexical-chunk-candidates.query.handler.ts'
import type {
  ChunkLexicalSearchQueryObject,
  ChunkVectorSimilarityQueryObject,
} from '../../../src/DocumentIndexes/Application/QueryObjects/chunk.query-object.ts'
import { Chunk } from '../../../src/DocumentIndexes/Domain/Entities/chunk.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { LexicalSearchQueryAdapter } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Mappers/lexical-search-query.adapter.ts'
import { ChunkModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/chunk.model.ts'
import { DocumentIndexModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index.model.ts'
import { ChunkRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/chunk.repository.ts'
import { DocumentSourceTypeEnum } from '../../../src/Documents/Domain/Enums/document-source-type.enum.ts'
import { DocumentRevisionModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document.model.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

const createEmbeddingVectorFixture = (x: number, y: number): number[] => [x, y, ...Array<number>(382).fill(0)]
const createChunkIdFixture = (ordinal: number): string => `20000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`
const chunkCreatedAtFixture = new Date('2026-10-15T04:05:06.789Z')

type RetrievalSessionFacts = { pid: number; snapshot: string; isolation: string; readOnly: string }

const inspectRetrievalSession = async (manager: EntityManager): Promise<RetrievalSessionFacts> => {
  const [facts] = await manager.query<RetrievalSessionFacts[]>(
    `SELECT pg_backend_pid() AS pid, txid_current_snapshot()::text AS snapshot,
      current_setting('transaction_isolation') AS isolation,
      current_setting('transaction_read_only') AS "readOnly"`,
  )
  assert.ok(facts)

  return facts
}

const seedDocumentIndexFixture = async (dataSource: DataSource, sourcePath: string): Promise<string> => {
  const documentModelRepository = dataSource.getRepository(DocumentModel)
  const documentRevisionModelRepository = dataSource.getRepository(DocumentRevisionModel)
  const documentIndexModelRepository = dataSource.getRepository(DocumentIndexModel)
  const document = await documentModelRepository.save(
    documentModelRepository.create({
      sourceType: DocumentSourceTypeEnum.REPOSITORY,
      sourceKey: 'native-candidate-test',
      sourcePath,
      currentTitle: sourcePath,
      unreferencedSince: null,
    }),
  )
  const revision = await documentRevisionModelRepository.save(
    documentRevisionModelRepository.create({
      documentId: document.id,
      contentSha256: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      title: sourcePath,
      content: sourcePath,
    }),
  )
  const index = await documentIndexModelRepository.save(
    documentIndexModelRepository.create({
      documentId: document.id,
      revisionId: revision.id,
      pipelineHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      chunkingModel: 'test-chunker',
      chunkingProfile: 'test',
      embeddingModel: 'test-model',
      embeddingDimensions: 384,
      embeddingProfile: 'test',
      lexicalProfile: 'test',
      relationProfile: 'test',
      status: DocumentIndexStatusEnum.READY,
      readyAt: new Date(),
      unreferencedSince: null,
    }),
  )

  return index.id
}

const seedChunkFixture = (
  dataSource: DataSource,
  id: number,
  documentIndexId: string,
  ordinal: number,
  embedding: number[],
  content: string,
  searchVector: string,
  tokenCount: number | null = 1,
): Promise<ChunkModel> => {
  const chunkModelRepository = dataSource.getRepository(ChunkModel)
  const attributes = {
    id: createChunkIdFixture(id),
    documentIndexId,
    ordinal,
    headingPath: ['Native candidates', `Section ${ordinal}`],
    content,
    blockStart: ordinal,
    blockEnd: ordinal + 1,
    tokenCount,
    embedding,
    searchVector,
    createdAt: chunkCreatedAtFixture,
  }

  return chunkModelRepository.save(chunkModelRepository.create(attributes))
}

const createCandidateFixture = async () => {
  const database = await createPersistenceTestDatabase()
  const { dataSource, retrievalDataSource, cleanup } = database
  const persistenceTransaction = new PersistenceTransaction(dataSource, retrievalDataSource)
  const chunkRepository = new ChunkRepository(persistenceTransaction, retrievalDataSource)

  try {
    const scopeA = await seedDocumentIndexFixture(dataSource, 'scope-a.md')
    const scopeB = await seedDocumentIndexFixture(dataSource, 'scope-b.md')
    const outsideScope = await seedDocumentIndexFixture(dataSource, 'outside-scope.md')
    await seedChunkFixture(dataSource, 1, scopeA, 0, createEmbeddingVectorFixture(1, 1), 'orbit', "'orbit':1")
    await seedChunkFixture(dataSource, 2, scopeB, 0, createEmbeddingVectorFixture(1, 1), 'orbit', "'orbit':1", null)
    await seedChunkFixture(dataSource, 3, scopeA, 1, createEmbeddingVectorFixture(0, 1), 'orbits', "'orbits':1")
    await seedChunkFixture(dataSource, 4, scopeA, 2, createEmbeddingVectorFixture(-1, 0), 'orbit', "'orbit':1")
    await seedChunkFixture(
      dataSource,
      5,
      outsideScope,
      0,
      createEmbeddingVectorFixture(1, 0),
      'orbit orbit orbit orbit',
      "'orbit':1,2,3,4",
    )
    await seedChunkFixture(dataSource, 6, scopeA, 3, createEmbeddingVectorFixture(0, -1), 'ORBIT', "'orbit':1")

    return { ...database, persistenceTransaction, chunkRepository, scopeA, scopeB, outsideScope }
  } catch (error) {
    await cleanup()

    throw error
  }
}

test(
  'repository writes persist repeated lexical terms with their source token positions',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup, persistenceTransaction, chunkRepository, scopeA, scopeB } =
      await createCandidateFixture()
    const formatter = new LexicalSearchQueryAdapter()
    const contents = [
      'Architecture BOUNDARIES architecture',
      'Architecture                 architecture',
      'Architecture boundaries',
      '繁體中文 Hybrid 檢索',
      '，。！？ --',
    ]
    const chunks = contents.map((content, index) => ({
      id: createChunkIdFixture(100 + index),
      documentIndexId: scopeA,
      ordinal: 10 + index,
      headingPath: ['Lexical write'],
      content,
      blockStart: index,
      blockEnd: index + 1,
      tokenCount: null,
      embedding: createEmbeddingVectorFixture(1, 0),
      createdAt: chunkCreatedAtFixture,
    }))

    try {
      const baselineChunks = await Promise.all(
        contents.map((content, index) =>
          seedChunkFixture(
            dataSource,
            200 + index,
            scopeB,
            10 + index,
            createEmbeddingVectorFixture(1, 0),
            content,
            formatter.formatSearchVector(formatter.format(content).terms),
          ),
        ),
      )
      await chunkRepository.insertChunks({ chunks })
      const baseline = await Promise.all(
        baselineChunks.map((chunk) => dataSource.getRepository(ChunkModel).findOneByOrFail({ id: chunk.id })),
      )
      const stored = await Promise.all(
        chunks.map((chunk) => dataSource.getRepository(ChunkModel).findOneByOrFail({ id: chunk.id })),
      )

      assert.deepEqual(
        stored.map((chunk) => chunk.content),
        contents,
      )
      assert.deepEqual(
        stored.map((chunk) => chunk.searchVector),
        baseline.map((chunk) => chunk.searchVector),
      )
      assert.equal(stored[0]?.searchVector, "'architecture':1,3 'boundaries':2")
      assert.equal(stored[1]?.searchVector, "'architecture':1,2")
      assert.ok(stored.every((chunk) => chunk.searchVector !== null))
      assert.ok(chunks.every((chunk) => !Object.hasOwn(chunk, 'searchVector')))

      const lexicalResult = await persistenceTransaction.runReadOnlySnapshot(async () => {
        const manager = persistenceTransaction.manager
        assert.ok(manager.queryRunner?.isTransactionActive)
        const lexicalQueryObject: ChunkLexicalSearchQueryObject = {
          documentIndexIds: [scopeA],
          queryText: 'architecture',
          limit: 3,
        }

        return persistenceTransaction.bind(manager, () =>
          chunkRepository.findByDocumentIndexIdsOrderByLexicalScoreDescAndIdAsc(lexicalQueryObject),
        )
      })

      assert.deepEqual(
        lexicalResult.map((chunk) => chunk.id),
        [createChunkIdFixture(100), createChunkIdFixture(101), createChunkIdFixture(102)],
      )
      assert.equal(
        lexicalResult[0]?.requireLexicalSearchScoreFor('architecture'),
        lexicalResult[1]?.requireLexicalSearchScoreFor('architecture'),
        'ts_rank reflects matching frequency here without rewarding proximity between occurrences',
      )
      assert.ok(
        (lexicalResult[0]?.requireLexicalSearchScoreFor('architecture') ?? NaN) >
          (lexicalResult[2]?.requireLexicalSearchScoreFor('architecture') ?? NaN),
        'repeated source terms have greater ts_rank than a single occurrence',
      )
    } finally {
      await cleanup()
    }
  },
)

test(
  'native PostgreSQL tsvector persistence accepts escaped lexemes and enforces position and lexeme bounds',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup, scopeA } = await createCandidateFixture()
    const formatter = new LexicalSearchQueryAdapter()

    try {
      const escapedVector = formatter.formatSearchVector(["o'reilly\\collection"])
      const escapedChunk = await seedChunkFixture(
        dataSource,
        300,
        scopeA,
        30,
        createEmbeddingVectorFixture(1, 0),
        "o'reilly\\collection",
        escapedVector,
      )
      const persistedEscapedChunk = await dataSource.getRepository(ChunkModel).findOneByOrFail({ id: escapedChunk.id })
      assert.equal(persistedEscapedChunk.searchVector, escapedVector)

      const positionLimitVector = formatter.formatSearchVector(Array<string>(257).fill('echo'))
      const positionLimitChunk = await seedChunkFixture(
        dataSource,
        301,
        scopeA,
        31,
        createEmbeddingVectorFixture(1, 0),
        'echo '.repeat(257),
        positionLimitVector,
      )
      const persistedPositionLimitChunk = await dataSource
        .getRepository(ChunkModel)
        .findOneByOrFail({ id: positionLimitChunk.id })
      assert.equal(persistedPositionLimitChunk.searchVector, positionLimitVector)

      const postgresSaturatedChunk = await seedChunkFixture(
        dataSource,
        302,
        scopeA,
        32,
        createEmbeddingVectorFixture(1, 0),
        'saturated',
        "'saturated':16384",
      )
      const persistedSaturatedChunk = await dataSource
        .getRepository(ChunkModel)
        .findOneByOrFail({ id: postgresSaturatedChunk.id })
      assert.equal(persistedSaturatedChunk.searchVector, "'saturated':16383")

      const oversizedLexeme = 'x'.repeat(2048)
      await assert.rejects(
        seedChunkFixture(
          dataSource,
          303,
          scopeA,
          33,
          createEmbeddingVectorFixture(1, 0),
          oversizedLexeme,
          `'${oversizedLexeme}':1`,
        ),
      )
    } finally {
      await cleanup()
    }
  },
)

test(
  'native semantic candidate rankings share the TypeORM read-only snapshot and retain connection ownership',
  { skip: !process.env.RAG_DATABASE_URL },
  async (context) => {
    const {
      dataSource,
      retrievalDataSource,
      cleanup,
      persistenceTransaction,
      chunkRepository,
      scopeA,
      scopeB,
      outsideScope,
    } = await createCandidateFixture()
    const semanticIn = (manager: EntityManager, chunkVectorSimilarityQO: ChunkVectorSimilarityQueryObject) =>
      persistenceTransaction.bind(manager, () =>
        chunkRepository.findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc(chunkVectorSimilarityQO),
      )

    try {
      await persistenceTransaction.runReadOnlySnapshot(async () => {
        const runner = persistenceTransaction.manager.queryRunner
        assert.ok(runner)
        assert.equal(persistenceTransaction.manager, runner.manager)
        const connection = await runner.connect()
        const release = context.mock.method(connection, 'release')
        const end = context.mock.method(connection, 'end')
        const queryCalls = context.mock.method(connection, 'query')
        const before = await inspectRetrievalSession(runner.manager)
        const documentIndexIds = Object.freeze([scopeA, scopeB])
        const chunkVectorSimilarityQO = {
          documentIndexIds,
          queryVector: Object.freeze(createEmbeddingVectorFixture(1, 0)),
          limit: 3,
        }

        assert.equal(before.pid, connection.processID)
        assert.equal(before.isolation, 'repeatable read')
        assert.equal(before.readOnly, 'on')

        await context.test('empty scope, vectors and nonpositive limits do not query PostgreSQL', async () => {
          const callsBefore = queryCalls.mock.callCount()
          assert.deepEqual(await semanticIn(runner.manager, { ...chunkVectorSimilarityQO, documentIndexIds: [] }), [])
          assert.deepEqual(await semanticIn(runner.manager, { ...chunkVectorSimilarityQO, queryVector: [] }), [])
          assert.deepEqual(await semanticIn(runner.manager, { ...chunkVectorSimilarityQO, limit: 0 }), [])
          assert.equal(queryCalls.mock.callCount(), callsBefore)
        })

        const callsBeforeSemantic = queryCalls.mock.callCount()
        const semanticResult = await semanticIn(runner.manager, chunkVectorSimilarityQO)
        assert.equal(queryCalls.mock.callCount(), callsBeforeSemantic + 1, 'semantic candidates use one native query')
        const semantic = semanticResult.map((chunk) => ({
          chunkId: chunk.id,
          distance: chunk.requireVectorCosineDistanceFor(chunkVectorSimilarityQO.queryVector),
        }))

        await context.test('semantic scope precedes top-K and cosine-distance ties use ascending IDs', async () => {
          assert.deepEqual(
            semantic.map((semanticDistance) => semanticDistance.chunkId),
            [createChunkIdFixture(1), createChunkIdFixture(2), createChunkIdFixture(3)],
          )
          assert.equal(typeof semantic[0]?.distance, 'number')
          assert.ok(Math.abs((semantic[0]?.distance ?? NaN) - (1 - Math.SQRT1_2)) < 1e-10)
          assert.equal(semantic[0]?.distance, semantic[1]?.distance)
          assert.equal(semantic[2]?.distance, 1)
          const signed = await semanticIn(runner.manager, { ...chunkVectorSimilarityQO, limit: 10 })
          assert.equal(signed.at(-1)?.id, createChunkIdFixture(4))
          assert.equal(signed.at(-1)?.vectorCosineDistanceFor(chunkVectorSimilarityQO.queryVector), 2)
          const outside = await semanticIn(runner.manager, {
            ...chunkVectorSimilarityQO,
            documentIndexIds: [outsideScope],
            limit: 1,
          })
          assert.equal(outside[0]?.id, createChunkIdFixture(5))
          assert.equal(outside[0]?.vectorCosineDistanceFor(chunkVectorSimilarityQO.queryVector), 0)
        })

        await context.test('semantic rankings include complete chunk attributes and numeric embeddings', async () => {
          assert.deepEqual(
            semanticResult.map((chunk) => chunk.id),
            semantic.map((semanticDistance) => semanticDistance.chunkId),
          )
          assert.ok(semanticResult.every((chunk) => chunk instanceof Chunk))
          assert.ok(semanticResult.every((chunk) => Number.isFinite(chunk.createdAt.epochMilliseconds)))
          const semanticChunkAttributes = semanticResult.map((chunk) => ({
            id: chunk.id,
            documentIndexId: chunk.documentIndexId,
            ordinal: chunk.ordinal,
            headingPath: chunk.headingPath,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
            embedding: chunk.embedding,
            searchVector: chunk.searchVector,
            createdAt: chunk.createdAt.nativeDate,
            blockStart: chunk.blockStart,
            blockEnd: chunk.blockEnd,
          }))
          assert.deepEqual(semanticChunkAttributes[0], {
            id: createChunkIdFixture(1),
            documentIndexId: scopeA,
            ordinal: 0,
            headingPath: ['Native candidates', 'Section 0'],
            content: 'orbit',
            tokenCount: 1,
            embedding: createEmbeddingVectorFixture(1, 1),
            searchVector: "'orbit':1",
            createdAt: chunkCreatedAtFixture,
            blockStart: 0,
            blockEnd: 1,
          })
          assert.deepEqual(semanticChunkAttributes[1], {
            id: createChunkIdFixture(2),
            documentIndexId: scopeB,
            ordinal: 0,
            headingPath: ['Native candidates', 'Section 0'],
            content: 'orbit',
            tokenCount: null,
            embedding: createEmbeddingVectorFixture(1, 1),
            searchVector: "'orbit':1",
            createdAt: chunkCreatedAtFixture,
            blockStart: 0,
            blockEnd: 1,
          })
          assert.deepEqual(semanticChunkAttributes[2], {
            id: createChunkIdFixture(3),
            documentIndexId: scopeA,
            ordinal: 1,
            headingPath: ['Native candidates', 'Section 1'],
            content: 'orbits',
            tokenCount: 1,
            embedding: createEmbeddingVectorFixture(0, 1),
            searchVector: "'orbits':1",
            createdAt: chunkCreatedAtFixture,
            blockStart: 1,
            blockEnd: 2,
          })
          assert.ok(semanticResult.every((chunk) => chunk.embedding.length === 384))
          assert.ok(
            semanticResult.every((chunk) => chunk.embedding.every((coordinate) => typeof coordinate === 'number')),
          )
        })

        await context.test('semantic chunks exclude a concurrent committed winner in the same snapshot', async () => {
          await seedChunkFixture(
            dataSource,
            0,
            scopeA,
            4,
            createEmbeddingVectorFixture(1, 0),
            'orbit orbit orbit orbit orbit',
            "'orbit':1,2,3,4,5",
          )
          const semanticAfter = await semanticIn(runner.manager, chunkVectorSimilarityQO)
          assert.deepEqual(
            semanticAfter.map((chunk) => [
              chunk.id,
              chunk.requireVectorCosineDistanceFor(chunkVectorSimilarityQO.queryVector),
            ]),
            semantic.map((semanticDistance) => [semanticDistance.chunkId, semanticDistance.distance]),
          )
          assert.deepEqual(semanticAfter, semanticResult)
          assert.deepEqual(await inspectRetrievalSession(runner.manager), before)

          const fresh = retrievalDataSource.createQueryRunner()
          try {
            await fresh.startTransaction('REPEATABLE READ')
            const freshSemantic = await semanticIn(fresh.manager, chunkVectorSimilarityQO)
            assert.equal(freshSemantic[0]?.id, createChunkIdFixture(0))
            assert.equal(freshSemantic[0]?.vectorCosineDistanceFor(chunkVectorSimilarityQO.queryVector), 0)
            assert.deepEqual(freshSemantic[0]?.embedding, createEmbeddingVectorFixture(1, 0))
          } finally {
            if (fresh.isTransactionActive) await fresh.rollbackTransaction()

            await fresh.release()
          }
        })

        await context.test('a native query failure leaves the connection owned by TypeORM', async () => {
          await runner.startTransaction()
          try {
            await assert.rejects(
              semanticIn(runner.manager, { ...chunkVectorSimilarityQO, queryVector: [1, 0] }),
              (error: unknown) => {
                assert.ok(error instanceof Error)
                assert.ok('driverError' in error && error.driverError && typeof error.driverError === 'object')
                assert.ok('code' in error.driverError)
                assert.equal(error.driverError.code, '22000')

                return true
              },
            )
            assert.equal(release.mock.callCount(), 0)
            assert.equal(end.mock.callCount(), 0)
          } finally {
            await runner.rollbackTransaction()
          }
          assert.deepEqual(await inspectRetrievalSession(runner.manager), before)
          const survivingRows = await persistenceTransaction.bind(runner.manager, () =>
            chunkRepository.findByDocumentIndexIdsAndChunkIds({
              documentIndexIds,
              chunkIds: [createChunkIdFixture(1)],
            }),
          )
          assert.equal(survivingRows[0]?.id, createChunkIdFixture(1))
        })

        assert.equal(release.mock.callCount(), 0)
        assert.equal(end.mock.callCount(), 0)
        queryCalls.mock.restore()
        release.mock.restore()
        end.mock.restore()
      })
      assert.equal(persistenceTransaction.manager, dataSource.manager)
    } finally {
      await cleanup()
    }
  },
)

test(
  'public lexical candidate rankings retain database top-K, scores, complete projections and snapshot requirements',
  { skip: !process.env.RAG_DATABASE_URL },
  async (context) => {
    const {
      dataSource,
      retrievalDataSource,
      cleanup,
      persistenceTransaction,
      chunkRepository,
      scopeA,
      scopeB,
      outsideScope,
    } = await createCandidateFixture()
    const chineseText = '繁體中文 Hybrid 檢索'
    const lexicalFormatter = new LexicalSearchQueryAdapter()
    const lexicalCandidates = new FindLexicalChunkCandidatesQueryHandler(chunkRepository)
    const lexicalIn = (manager: EntityManager, findLexicalChunkCandidatesDTO: FindLexicalChunkCandidatesDTO) =>
      persistenceTransaction.bind(manager, () => lexicalCandidates.execute(findLexicalChunkCandidatesDTO))

    try {
      await seedChunkFixture(
        dataSource,
        7,
        scopeA,
        10,
        createEmbeddingVectorFixture(0, 1),
        chineseText,
        lexicalFormatter.formatSearchVector(lexicalFormatter.format(chineseText).terms),
      )
      await persistenceTransaction.runReadOnlySnapshot(async () => {
        const runner = persistenceTransaction.manager.queryRunner
        assert.ok(runner)
        const connection = await runner.connect()
        const queryCalls = context.mock.method(connection, 'query')
        const before = await inspectRetrievalSession(runner.manager)
        const lexicalInput = {
          documentIndexIds: Object.freeze([scopeA, scopeB]),
          queryText: 'ORBIT',
          limit: 3,
        }

        await context.test('empty scope, query text and nonpositive limits do not query PostgreSQL', async () => {
          const callsBefore = queryCalls.mock.callCount()
          assert.deepEqual(await lexicalIn(runner.manager, { ...lexicalInput, documentIndexIds: [] }), [])
          assert.deepEqual(await lexicalIn(runner.manager, { ...lexicalInput, queryText: '' }), [])
          assert.deepEqual(await lexicalIn(runner.manager, { ...lexicalInput, queryText: '，。！？ --' }), [])
          assert.deepEqual(await lexicalIn(runner.manager, { ...lexicalInput, limit: 0 }), [])
          assert.equal(queryCalls.mock.callCount(), callsBefore)
        })

        await context.test('Chinese words use the persisted segmenter profile for matching', async () => {
          const chineseResult = await lexicalIn(runner.manager, { ...lexicalInput, queryText: chineseText, limit: 1 })
          const [matchedChineseChunk] = chineseResult

          assert.ok(matchedChineseChunk instanceof Chunk)
          assert.deepEqual(
            chineseResult.map((chunk) => chunk.id),
            [createChunkIdFixture(7)],
          )
          assert.ok(matchedChineseChunk.requireLexicalSearchScoreFor(chineseText) > 0)
        })

        const callsBeforeLexical = queryCalls.mock.callCount()
        const lexicalResult = await lexicalIn(runner.manager, lexicalInput)
        assert.equal(queryCalls.mock.callCount(), callsBeforeLexical + 1, 'lexical candidates use one native query')
        const lexical = lexicalResult.map((chunk) => ({
          chunkId: chunk.id,
          score: chunk.requireLexicalSearchScoreFor(lexicalInput.queryText),
        }))

        await context.test(
          'lexical scope precedes top-K and numeric ts_rank preserves simple-query semantics',
          async () => {
            assert.deepEqual(
              lexical.map((lexicalScore) => lexicalScore.chunkId),
              [createChunkIdFixture(1), createChunkIdFixture(2), createChunkIdFixture(4)],
            )
            assert.equal(typeof lexical[0]?.score, 'number')
            assert.ok(
              Math.abs((lexical[0]?.score ?? NaN) - 0.06079271) < 1e-8,
              'ts_rank differs from ts_rank_cd (0.1) for one positional lexeme',
            )
            assert.equal(lexical[0]?.score, lexical[1]?.score)
            const outside = await lexicalIn(runner.manager, {
              ...lexicalInput,
              documentIndexIds: [outsideScope],
              limit: 1,
            })
            assert.equal(outside[0]?.id, createChunkIdFixture(5))
            assert.ok(
              (outside[0]?.requireLexicalSearchScoreFor(lexicalInput.queryText) ?? NaN) > (lexical[0]?.score ?? NaN),
            )
            const inflected = await lexicalIn(runner.manager, { ...lexicalInput, queryText: 'orbits' })
            assert.deepEqual(
              inflected.map((chunk) => chunk.id),
              [createChunkIdFixture(3)],
            )
            const conjunction = await lexicalIn(runner.manager, { ...lexicalInput, queryText: 'orbit missing' })
            assert.deepEqual(conjunction, [])
          },
        )

        await context.test('lexical rankings include complete chunk attributes and numeric embeddings', async () => {
          assert.deepEqual(
            lexicalResult.map((chunk) => chunk.id),
            lexical.map((lexicalScore) => lexicalScore.chunkId),
          )
          assert.ok(lexicalResult.every((chunk) => chunk instanceof Chunk))
          const lexicalChunkAttributes = lexicalResult.map((chunk) => ({
            id: chunk.id,
            documentIndexId: chunk.documentIndexId,
            ordinal: chunk.ordinal,
            headingPath: chunk.headingPath,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
            embedding: chunk.embedding,
            searchVector: chunk.searchVector,
            createdAt: chunk.createdAt.nativeDate,
            blockStart: chunk.blockStart,
            blockEnd: chunk.blockEnd,
          }))
          assert.deepEqual(lexicalChunkAttributes[0], {
            id: createChunkIdFixture(1),
            documentIndexId: scopeA,
            ordinal: 0,
            headingPath: ['Native candidates', 'Section 0'],
            content: 'orbit',
            tokenCount: 1,
            embedding: createEmbeddingVectorFixture(1, 1),
            searchVector: "'orbit':1",
            createdAt: chunkCreatedAtFixture,
            blockStart: 0,
            blockEnd: 1,
          })
          assert.deepEqual(lexicalChunkAttributes[1], {
            ...lexicalChunkAttributes[0],
            id: createChunkIdFixture(2),
            documentIndexId: scopeB,
            tokenCount: null,
          })
          assert.deepEqual(lexicalChunkAttributes[2], {
            id: createChunkIdFixture(4),
            documentIndexId: scopeA,
            ordinal: 2,
            headingPath: ['Native candidates', 'Section 2'],
            content: 'orbit',
            tokenCount: 1,
            embedding: createEmbeddingVectorFixture(-1, 0),
            searchVector: "'orbit':1",
            createdAt: chunkCreatedAtFixture,
            blockStart: 2,
            blockEnd: 3,
          })
          assert.ok(lexicalResult.every((chunk) => chunk.embedding.length === 384))
          assert.ok(
            lexicalResult.every((chunk) => chunk.embedding.every((coordinate) => typeof coordinate === 'number')),
          )
        })

        await context.test(
          'lexical projections exclude a concurrent committed winner in the same snapshot',
          async () => {
            await seedChunkFixture(
              dataSource,
              0,
              scopeA,
              4,
              createEmbeddingVectorFixture(1, 0),
              'orbit orbit orbit orbit orbit',
              "'orbit':1,2,3,4,5",
            )
            const lexicalAfter = await lexicalIn(runner.manager, lexicalInput)
            assert.deepEqual(
              lexicalAfter.map((chunk) => [chunk.id, chunk.requireLexicalSearchScoreFor(lexicalInput.queryText)]),
              lexical.map((lexicalScore) => [lexicalScore.chunkId, lexicalScore.score]),
            )
            assert.deepEqual(lexicalAfter, lexicalResult)
            assert.deepEqual(await inspectRetrievalSession(runner.manager), before)
            const fresh = retrievalDataSource.createQueryRunner()
            try {
              await fresh.startTransaction('REPEATABLE READ')
              const freshLexical = await lexicalIn(fresh.manager, lexicalInput)
              assert.equal(freshLexical[0]?.id, createChunkIdFixture(0))
              assert.ok(
                (freshLexical[0]?.requireLexicalSearchScoreFor(lexicalInput.queryText) ?? NaN) >
                  (lexical[0]?.score ?? NaN),
              )
            } finally {
              if (fresh.isTransactionActive) await fresh.rollbackTransaction()

              await fresh.release()
            }
          },
        )
        queryCalls.mock.restore()
      })
      assert.equal(persistenceTransaction.manager, dataSource.manager)
    } finally {
      await cleanup()
    }
  },
)
