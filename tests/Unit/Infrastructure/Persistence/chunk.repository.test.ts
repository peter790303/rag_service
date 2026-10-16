import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { In } from 'typeorm'
import type { DataSource } from 'typeorm'
import type { EntityManager, FindManyOptions, FindOptionsWhere } from 'typeorm'

import type {
  ChunkIndexQueryObject,
  ChunkIndexOrdinalsQueryObject,
} from '../../../../src/Application/Chunks/QueryObjects/chunk.query-object.ts'
import { Chunk } from '../../../../src/Domain/Chunk/chunk.ts'
import { InvalidChunkOrdinalException } from '../../../../src/Domain/Chunk/Exceptions/invalid-chunk-ordinal.exception.ts'
import { ChunkModel } from '../../../../src/Infrastructure/Persistence/Models/chunk.model.ts'
import { PersistenceTransaction } from '../../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { ChunkRepository } from '../../../../src/Infrastructure/Persistence/Repositories/chunk.repository.ts'

const createChunkModel = (chunkModelOverrides: Partial<ChunkModel> = {}): ChunkModel =>
  Object.assign(new ChunkModel(), {
    id: 'chunk-1',
    documentIndexId: 'index-1',
    ordinal: 0,
    headingPath: ['Heading'],
    content: 'body',
    blockStart: 0,
    blockEnd: 1,
    tokenCount: null,
    embedding: [1, 0],
    searchVector: "'body':1",
    createdAt: new Date('2026-10-15T00:00:00.000Z'),
    ...chunkModelOverrides,
  })

const assertChunks = (chunks: Chunk[], persistedChunkModels: ChunkModel[]): void => {
  assert.equal(chunks.length, persistedChunkModels.length)

  chunks.forEach((chunk, chunkIndex) => {
    const persistedChunkModel = persistedChunkModels[chunkIndex]
    assert.ok(persistedChunkModel)
    assert.ok(chunk instanceof Chunk)
    chunk.assertBelongsToDocumentIndex(persistedChunkModel.documentIndexId)
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
      { ...persistedChunkModel },
    )
  })
}

describe('ChunkRepository native chunkFindCriteria', () => {
  const createChunkRepository = (persistenceTransaction: PersistenceTransaction): ChunkRepository => {
    const retrievalDataSource = {
      options: { type: 'postgres', schema: 'chunk_repository_unit' },
      driver: { version: '17.2' },
      isInitialized: true,
    } as unknown as DataSource

    return new ChunkRepository(persistenceTransaction, retrievalDataSource)
  }
  it('deletes only the requested index and keeps chunks belonging to another index', async () => {
    let storedChunks = [
      createChunkModel({ id: 'target-chunk', documentIndexId: 'target-index' }),
      createChunkModel({ id: 'other-chunk', documentIndexId: 'other-index' }),
    ]
    const manager = {
      getRepository(chunkModelType: typeof ChunkModel) {
        assert.equal(chunkModelType, ChunkModel)

        return {
          async findBy(chunkCriteria: FindOptionsWhere<ChunkModel>) {
            return storedChunks.filter((chunk) => chunk.documentIndexId === chunkCriteria.documentIndexId)
          },
          async delete(chunkCriteria: FindOptionsWhere<ChunkModel>) {
            assert.deepEqual(chunkCriteria, { documentIndexId: 'target-index' })
            storedChunks = storedChunks.filter((chunk) => chunk.documentIndexId !== chunkCriteria.documentIndexId)
          },
        }
      },
    } as unknown as EntityManager
    const chunkIndexQO: ChunkIndexQueryObject = Object.freeze({ documentIndexId: 'target-index' })
    const chunkRepository = createChunkRepository(new PersistenceTransaction({ manager } as DataSource))

    assert.deepEqual(
      (await chunkRepository.findByDocumentIndexId(chunkIndexQO)).map((chunk) => chunk.id),
      ['target-chunk'],
    )

    await chunkRepository.removeByDocumentIndexId(chunkIndexQO)

    assert.deepEqual(await chunkRepository.findByDocumentIndexId(chunkIndexQO), [])
    assert.deepEqual(
      storedChunks.map((chunk) => chunk.id),
      ['other-chunk'],
    )
    assert.deepEqual(chunkIndexQO, { documentIndexId: 'target-index' })
  })

  it('hydrates only top-K chunk IDs within the authorized index scope in one native query', async () => {
    const documentIndexIds = Object.freeze(['active-a', 'active-b'])
    const chunkIds = Object.freeze(['chunk-b', 'chunk-a'])
    const chunks = [createChunkModel({ id: 'chunk-a', documentIndexId: 'active-a' })]
    const chunkFindCriteria: FindOptionsWhere<ChunkModel>[] = []
    const manager = {
      getRepository(chunkModelType: typeof ChunkModel) {
        assert.equal(chunkModelType, ChunkModel)

        return {
          async findBy(chunkCriteria: FindOptionsWhere<ChunkModel>) {
            chunkFindCriteria.push(chunkCriteria)

            return chunks
          },
        }
      },
    } as unknown as EntityManager

    const scopedChunks = await createChunkRepository(
      new PersistenceTransaction({ manager } as DataSource),
    ).findByDocumentIndexIdsAndChunkIds({
      documentIndexIds,
      chunkIds,
    })

    assertChunks(scopedChunks, chunks)
    assert.deepEqual(chunkFindCriteria, [
      { documentIndexId: In(['active-a', 'active-b']), id: In(['chunk-b', 'chunk-a']) },
    ])
  })

  it('does not open a repository when either candidate IDs or index scope is empty', async () => {
    const manager = {
      getRepository() {
        assert.fail('empty candidates or index scope must not execute a query')
      },
    } as unknown as EntityManager
    const chunkRepository = createChunkRepository(new PersistenceTransaction({ manager } as DataSource))

    assert.deepEqual(
      await chunkRepository.findByDocumentIndexIdsAndChunkIds({ documentIndexIds: [], chunkIds: ['chunk'] }),
      [],
    )
    assert.deepEqual(
      await chunkRepository.findByDocumentIndexIdsAndChunkIds({ documentIndexIds: ['active'], chunkIds: [] }),
      [],
    )
    assert.deepEqual(
      await chunkRepository.findByDocumentIndexIdsAndChunkIds({ documentIndexIds: [], chunkIds: [] }),
      [],
    )
  })

  it('keeps each approved ordinal condition paired with its index, including ordinal zero', async () => {
    const chunks = [createChunkModel({ documentIndexId: 'active-a', ordinal: 0 })]
    const chunkFindCriteria: FindOptionsWhere<ChunkModel>[] = []
    const manager = {
      getRepository(chunkModelType: typeof ChunkModel) {
        assert.equal(chunkModelType, ChunkModel)

        return {
          async findBy(chunkCriteria: FindOptionsWhere<ChunkModel>) {
            chunkFindCriteria.push(chunkCriteria)

            return chunks
          },
        }
      },
    } as unknown as EntityManager
    const chunkRepository = createChunkRepository(new PersistenceTransaction({ manager } as DataSource))
    const chunkIndexOrdinalsQO: ChunkIndexOrdinalsQueryObject = Object.freeze({
      documentIndexId: 'active-a',
      ordinals: Object.freeze([0, 1]),
    })

    const scopedChunks = await chunkRepository.findByDocumentIndexIdAndOrdinals(chunkIndexOrdinalsQO)
    await chunkRepository.findByDocumentIndexIdAndOrdinals({ documentIndexId: 'active-b', ordinals: [3] })

    assertChunks(scopedChunks, chunks)
    assert.deepEqual(chunkFindCriteria, [
      { documentIndexId: 'active-a', ordinal: In([0, 1]) },
      { documentIndexId: 'active-b', ordinal: In([3]) },
    ])
    assert.deepEqual(chunkIndexOrdinalsQO, { documentIndexId: 'active-a', ordinals: [0, 1] })
  })

  it('does not open a repository when ordinals are empty', async () => {
    const manager = {
      getRepository() {
        assert.fail('empty context must not execute an unscoped query')
      },
    } as unknown as EntityManager
    const chunkRepository = createChunkRepository(new PersistenceTransaction({ manager } as DataSource))

    assert.deepEqual(
      await chunkRepository.findByDocumentIndexIdAndOrdinals({ documentIndexId: 'active-a', ordinals: [] }),
      [],
    )
  })

  it('restores complete chunks within the requested index scope in one native query', async () => {
    const chunkFindCriteria: FindOptionsWhere<ChunkModel>[] = []
    const persistedChunks = [
      createChunkModel({ id: 'chunk-a', documentIndexId: 'index-a' }),
      createChunkModel({ id: 'chunk-b', documentIndexId: 'index-b' }),
      createChunkModel({ id: 'chunk-c', documentIndexId: 'index-a' }),
    ]
    const manager = {
      getRepository(chunkModelType: typeof ChunkModel) {
        assert.equal(chunkModelType, ChunkModel)

        return {
          async findBy(chunkCriteria: FindOptionsWhere<ChunkModel>) {
            chunkFindCriteria.push(chunkCriteria)

            return persistedChunks
          },
        }
      },
    } as unknown as EntityManager
    const chunkRepository = createChunkRepository(new PersistenceTransaction({ manager } as DataSource))

    const scopedChunks = await chunkRepository.findByDocumentIndexIds({
      documentIndexIds: ['index-a', 'index-b', 'empty-index'],
    })

    assertChunks(scopedChunks, persistedChunks)
    assert.deepEqual(chunkFindCriteria, [{ documentIndexId: In(['index-a', 'index-b', 'empty-index']) }])
  })

  it('loads chunks within the requested indexes in stable index and ordinal order', async () => {
    const chunkFindCriteria: FindManyOptions<ChunkModel>[] = []
    const chunks = [createChunkModel({ documentIndexId: 'index-a', ordinal: 0 })]
    const manager = {
      getRepository(chunkModelType: typeof ChunkModel) {
        assert.equal(chunkModelType, ChunkModel)

        return {
          async find(findChunksOptions: FindManyOptions<ChunkModel>) {
            chunkFindCriteria.push(findChunksOptions)

            return chunks
          },
        }
      },
    } as unknown as EntityManager
    const chunkIndexIdsQO = Object.freeze({ documentIndexIds: Object.freeze(['index-b', 'index-a']) })

    assertChunks(
      await createChunkRepository(
        new PersistenceTransaction({ manager } as DataSource),
      ).findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc(chunkIndexIdsQO),
      chunks,
    )
    assert.deepEqual(chunkFindCriteria, [
      {
        where: { documentIndexId: In(['index-b', 'index-a']) },
        order: { documentIndexId: 'ASC', ordinal: 'ASC' },
      },
    ])
    assert.deepEqual(chunkIndexIdsQO.documentIndexIds, ['index-b', 'index-a'])
  })

  it('rejects invalid persisted chunk state through the real restoration path', async () => {
    const manager = {
      getRepository(chunkModelType: typeof ChunkModel) {
        assert.equal(chunkModelType, ChunkModel)

        return {
          async findBy(chunkCriteria: FindOptionsWhere<ChunkModel>) {
            assert.deepEqual(chunkCriteria, { documentIndexId: 'index-1' })

            return [createChunkModel({ ordinal: -1 })]
          },
        }
      },
    } as unknown as EntityManager

    await assert.rejects(
      createChunkRepository(new PersistenceTransaction({ manager } as DataSource)).findByDocumentIndexId({
        documentIndexId: 'index-1',
      }),
      InvalidChunkOrdinalException,
    )
  })

  it('returns no chunks without a query when the index scope is empty', async () => {
    const manager = {
      getRepository() {
        assert.fail('empty index scope must not execute an unscoped query')
      },
    } as unknown as EntityManager
    const chunkRepository = createChunkRepository(new PersistenceTransaction({ manager } as DataSource))

    assert.deepEqual(await chunkRepository.findByDocumentIndexIds({ documentIndexIds: [] }), [])
    assert.deepEqual(
      await chunkRepository.findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc({ documentIndexIds: [] }),
      [],
    )
  })
})
