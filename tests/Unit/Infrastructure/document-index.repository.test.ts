import assert from 'node:assert/strict'
import test from 'node:test'

import { DataSource, type EntityManager, In, LessThanOrEqual } from 'typeorm'

import { ReadDocumentIndexAssembler } from '../../../src/Application/DocumentIndexes/Assemblers/read-document-index.assembler.ts'
import { DocumentIndex } from '../../../src/Domain/DocumentIndex/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { InvalidDocumentIndexTimestampException } from '../../../src/Domain/DocumentIndex/Exceptions/invalid-document-index-timestamp.exception.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { DocumentIndexRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index.repository.ts'

const createRepositoryManagerStub = (): EntityManager => new DataSource({ type: 'postgres' }).manager
const createDocumentIndexModelFixture = (): DocumentIndexModel =>
  Object.assign(new DocumentIndexModel(), {
    id: 'index-1',
    documentId: 'document-1',
    revisionId: 'revision-1',
    pipelineHash: 'pipeline-1',
    chunkingModel: 'chunker',
    chunkingProfile: 'chunker-v1',
    embeddingModel: 'embedding',
    embeddingDimensions: 2,
    embeddingProfile: 'embedding-v1',
    lexicalProfile: 'lexical-v1',
    relationProfile: 'relations-v1',
    status: DocumentIndexStatusEnum.BUILDING,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    readyAt: null,
    unreferencedSince: null,
  })

test('document-index locks preserve the ID and skip-locked behavior through native options', async (context) => {
  const manager = createRepositoryManagerStub()
  const documentIndexModelRepository = manager.getRepository(DocumentIndexModel)
  const findOne = context.mock.method(documentIndexModelRepository, 'findOne', async () => null)
  const documentIndexRepository = new DocumentIndexRepository(new PersistenceTransaction(manager.connection))

  assert.equal(await documentIndexRepository.lockByDocumentIndexId({ documentIndexId: 'index-1' }), null)
  assert.equal(await documentIndexRepository.lockByDocumentIndexIdSkipLocked({ documentIndexId: 'index-2' }), null)

  assert.deepEqual(findOne.mock.calls[0]?.arguments, [
    { where: { id: 'index-1' }, lock: { mode: 'pessimistic_write' } },
  ])
  assert.deepEqual(findOne.mock.calls[1]?.arguments, [
    { where: { id: 'index-2' }, lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' } },
  ])
})

test('revision and pipeline lookups remain paired and reference lookups use their specific foreign key', async (context) => {
  const manager = createRepositoryManagerStub()
  const documentIndexModelRepository = manager.getRepository(DocumentIndexModel)
  const documentIndexModel = createDocumentIndexModelFixture()
  const findOneBy = context.mock.method(documentIndexModelRepository, 'findOneBy', async () => documentIndexModel)
  const findBy = context.mock.method(documentIndexModelRepository, 'findBy', async () => [
    documentIndexModel,
    Object.assign(createDocumentIndexModelFixture(), { id: 'index-2' }),
  ])
  const documentIndexRepository = new DocumentIndexRepository(new PersistenceTransaction(manager.connection))

  const restoredDocumentIndexDTO = await documentIndexRepository.findByDocumentRevisionIdAndPipelineHash({
    revisionId: 'revision-1',
    pipelineHash: 'pipeline-1',
  })

  assert.ok(restoredDocumentIndexDTO instanceof DocumentIndex)
  assert.deepEqual(ReadDocumentIndexAssembler.toDocumentIndexRecordDTO(restoredDocumentIndexDTO), {
    ...documentIndexModel,
  })
  assert.deepEqual(
    (await documentIndexRepository.findByDocumentId({ documentId: 'document-1' })).map((index) => index.id),
    ['index-1', 'index-2'],
  )
  assert.deepEqual(
    (await documentIndexRepository.findByRevisionId({ revisionId: 'revision-1' })).map((index) => index.id),
    ['index-1', 'index-2'],
  )

  assert.deepEqual(findOneBy.mock.calls[0]?.arguments, [{ revisionId: 'revision-1', pipelineHash: 'pipeline-1' }])
  assert.deepEqual(findBy.mock.calls[0]?.arguments, [{ documentId: 'document-1' }])
  assert.deepEqual(findBy.mock.calls[1]?.arguments, [{ revisionId: 'revision-1' }])
})

test('empty document-index ID lookups skip persistence', async (context) => {
  const manager = createRepositoryManagerStub()
  const documentIndexRepository = new DocumentIndexRepository(new PersistenceTransaction(manager.connection))
  const getRepository = context.mock.method(manager, 'getRepository', () => {
    throw new Error('empty IDs must not query document indexes')
  })

  assert.deepEqual(await documentIndexRepository.findByDocumentIdsOrderByCreatedAtAscAndIdAsc({ documentIds: [] }), [])
  assert.equal(getRepository.mock.callCount(), 0)
})

test('document-index candidate queries preserve cutoff and deterministic ordering', async (context) => {
  const manager = createRepositoryManagerStub()
  const documentIndexModelRepository = manager.getRepository(DocumentIndexModel)
  const documentIndexModel = createDocumentIndexModelFixture()
  const find = context.mock.method(documentIndexModelRepository, 'find', async () => [documentIndexModel])
  const documentIndexRepository = new DocumentIndexRepository(new PersistenceTransaction(manager.connection))
  const cutoff = new Date('2026-10-14T00:00:00.000Z')

  const garbageCandidateIndexes = await documentIndexRepository.findByUnreferencedSinceLessThanOrEqualOrderByIdAsc({
    cutoff,
  })
  const documentIndexes = await documentIndexRepository.findByDocumentIdsOrderByCreatedAtAscAndIdAsc({
    documentIds: ['document-1', 'document-2'],
  })

  const testCases = [...garbageCandidateIndexes, ...documentIndexes]
  testCases.forEach((restoredDocumentIndexDTO) => {
    assert.ok(restoredDocumentIndexDTO instanceof DocumentIndex)
    assert.deepEqual(ReadDocumentIndexAssembler.toDocumentIndexRecordDTO(restoredDocumentIndexDTO), {
      ...documentIndexModel,
    })
  })
  assert.equal(garbageCandidateIndexes.length, 1)
  assert.equal(documentIndexes.length, 1)

  assert.deepEqual(find.mock.calls[0]?.arguments, [
    { where: { unreferencedSince: LessThanOrEqual(cutoff) }, order: { id: 'ASC' } },
  ])
  assert.deepEqual(find.mock.calls[1]?.arguments, [
    { where: { documentId: In(['document-1', 'document-2']) }, order: { createdAt: 'ASC', id: 'ASC' } },
  ])
})

test('full document-index reads reject invalid persisted lifecycle timestamps while restoring the Entity', async (context) => {
  const manager = createRepositoryManagerStub()
  const documentIndexModelRepository = manager.getRepository(DocumentIndexModel)
  const documentIndexModel = createDocumentIndexModelFixture()
  documentIndexModel.readyAt = new Date(Number.NaN)
  context.mock.method(documentIndexModelRepository, 'findOneBy', async () => documentIndexModel)
  const documentIndexRepository = new DocumentIndexRepository(new PersistenceTransaction(manager.connection))

  await assert.rejects(
    documentIndexRepository.findByDocumentIndexId({ documentIndexId: 'index-1' }),
    InvalidDocumentIndexTimestampException,
  )
})
