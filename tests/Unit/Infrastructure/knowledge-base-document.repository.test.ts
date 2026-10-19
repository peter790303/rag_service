import assert from 'node:assert/strict'
import test from 'node:test'

import { DataSource, type EntityManager, IsNull } from 'typeorm'

import type { KnowledgeBaseDocumentActivationQueryObject } from '../../../src/Application/KnowledgeBaseDocuments/QueryObjects/knowledge-base-document.query-object.ts'
import { KnowledgeBaseDocument } from '../../../src/Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import { KnowledgeBaseDocumentModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { KnowledgeBaseDocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base-document.repository.ts'

const createRepositoryManagerStub = (): EntityManager => new DataSource({ type: 'postgres' }).manager

test('full knowledgeBaseDocument updates retain false, zero generation and null, while detach writes only its own fields', async (context) => {
  const manager = createRepositoryManagerStub()
  const modelRepository = manager.getRepository(KnowledgeBaseDocumentModel)
  const update = context.mock.method(modelRepository, 'update', async () => ({
    affected: 1,
    raw: [],
    generatedMaps: [],
  }))
  const repository = new KnowledgeBaseDocumentRepository(new PersistenceTransaction(manager.connection))
  const identity = { knowledgeBaseId: 'kb-1', documentId: 'document-1' }
  const updatedAt = new Date(0)
  const state = {
    isEntry: false,
    alwaysIncludeFullContent: false,
    requestedGeneration: '0',
    activeDocumentIndexId: null,
    updatedAt,
  }

  await repository.updateByKnowledgeBaseIdAndDocumentId({ ...identity, ...state })
  await repository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId({
    ...identity,
    activeDocumentIndexId: null,
    updatedAt,
  })

  assert.deepEqual(
    update.mock.calls.map((call) => call.arguments),
    [
      [identity, state],
      [identity, { activeDocumentIndexId: null, updatedAt }],
    ],
  )
})

test('knowledgeBaseDocument full reads restore domain generation and retain actual persistence settings without extra queries', async (context) => {
  const manager = createRepositoryManagerStub()
  const knowledgeBaseDocumentModelRepository = manager.getRepository(KnowledgeBaseDocumentModel)
  const updatedAt = new Date('2026-10-14T12:00:00.000Z')
  const persistedKnowledgeBaseDocument = Object.assign(new KnowledgeBaseDocumentModel(), {
    knowledgeBaseId: 'kb-1',
    documentId: 'document-1',
    requestedGeneration: '9007199254740993',
    activeDocumentIndexId: 'index-1',
    isEntry: true,
    alwaysIncludeFullContent: false,
    updatedAt,
  })
  const findOneBy = context.mock.method(
    knowledgeBaseDocumentModelRepository,
    'findOneBy',
    async () => persistedKnowledgeBaseDocument,
  )
  const knowledgeBaseDocumentRepository = new KnowledgeBaseDocumentRepository(
    new PersistenceTransaction(manager.connection),
  )

  const restoredKnowledgeBaseDocumentDTO = await knowledgeBaseDocumentRepository.findByKnowledgeBaseIdAndDocumentId({
    knowledgeBaseId: 'kb-1',
    documentId: 'document-1',
  })

  assert.ok(restoredKnowledgeBaseDocumentDTO instanceof KnowledgeBaseDocument)
  assert.equal(restoredKnowledgeBaseDocumentDTO.requestedGeneration, '9007199254740993')
  assert.equal(restoredKnowledgeBaseDocumentDTO.activeDocumentIndexId, 'index-1')
  assert.equal(restoredKnowledgeBaseDocumentDTO.isEntry, true)
  assert.equal(restoredKnowledgeBaseDocumentDTO.alwaysIncludeFullContent, false)
  assert.deepEqual(restoredKnowledgeBaseDocumentDTO.updatedAt.nativeDate, updatedAt)
  assert.notEqual(restoredKnowledgeBaseDocumentDTO.updatedAt.nativeDate, updatedAt)
  assert.equal(findOneBy.mock.callCount(), 1)
  assert.deepEqual(findOneBy.mock.calls[0]?.arguments, [{ knowledgeBaseId: 'kb-1', documentId: 'document-1' }])
})

test('knowledgeBaseDocument availability locks preserve the knowledge-base/document pair and skip contention', async (context) => {
  const manager = createRepositoryManagerStub()
  const knowledgeBaseDocumentModelRepository = manager.getRepository(KnowledgeBaseDocumentModel)
  const findOne = context.mock.method(knowledgeBaseDocumentModelRepository, 'findOne', async () => null)

  assert.equal(
    await new KnowledgeBaseDocumentRepository(
      new PersistenceTransaction(manager.connection),
    ).lockByKnowledgeBaseIdAndDocumentIdSkipLocked({ knowledgeBaseId: 'kb-1', documentId: 'document-1' }),
    null,
  )
  assert.deepEqual(findOne.mock.calls[0]?.arguments, [
    {
      where: { knowledgeBaseId: 'kb-1', documentId: 'document-1' },
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    },
  ])
})

test('knowledgeBaseDocument activation retains generation and null/index CAS fences with affected-row results', async (context) => {
  const manager = createRepositoryManagerStub()
  const knowledgeBaseDocumentModelRepository = manager.getRepository(KnowledgeBaseDocumentModel)
  let affected = 1
  const update = context.mock.method(knowledgeBaseDocumentModelRepository, 'update', async () => ({
    affected,
    raw: [],
    generatedMaps: [],
  }))
  const knowledgeBaseDocumentRepository = new KnowledgeBaseDocumentRepository(
    new PersistenceTransaction(manager.connection),
  )
  const knowledgeBaseDocumentActivationQO: KnowledgeBaseDocumentActivationQueryObject = {
    knowledgeBaseId: 'kb-1',
    documentId: 'document-1',
    requestedGeneration: '2',
    expectedActiveDocumentIndexId: null,
    documentIndexId: 'index-2',
    updatedAt: new Date('2026-10-14T12:00:00.000Z'),
  }

  const persistedKnowledgeBaseDocument = Object.assign(new KnowledgeBaseDocumentModel(), {
    knowledgeBaseId: 'kb-1',
    documentId: 'document-1',
    requestedGeneration: '2',
    activeDocumentIndexId: 'index-2',
    isEntry: false,
    alwaysIncludeFullContent: false,
    updatedAt: knowledgeBaseDocumentActivationQO.updatedAt,
  })
  const findOneBy = context.mock.method(
    knowledgeBaseDocumentModelRepository,
    'findOneBy',
    async () => persistedKnowledgeBaseDocument,
  )
  const activatedKnowledgeBaseDocument =
    await knowledgeBaseDocumentRepository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
      knowledgeBaseDocumentActivationQO,
    )
  assert.ok(activatedKnowledgeBaseDocument instanceof KnowledgeBaseDocument)
  assert.equal(activatedKnowledgeBaseDocument.activeDocumentIndexId, 'index-2')
  assert.equal(activatedKnowledgeBaseDocument.requestedGeneration, '2')
  assert.deepEqual(activatedKnowledgeBaseDocument.updatedAt.nativeDate, knowledgeBaseDocumentActivationQO.updatedAt)
  affected = 0
  assert.equal(
    await knowledgeBaseDocumentRepository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
      { ...knowledgeBaseDocumentActivationQO, expectedActiveDocumentIndexId: 'index-1' },
    ),
    null,
  )
  assert.equal(findOneBy.mock.callCount(), 1)
  assert.deepEqual(findOneBy.mock.calls[0]?.arguments, [{ knowledgeBaseId: 'kb-1', documentId: 'document-1' }])
  assert.deepEqual(update.mock.calls[0]?.arguments, [
    {
      knowledgeBaseId: 'kb-1',
      documentId: 'document-1',
      requestedGeneration: '2',
      activeDocumentIndexId: IsNull(),
    },
    { activeDocumentIndexId: 'index-2', updatedAt: knowledgeBaseDocumentActivationQO.updatedAt },
  ])
  assert.deepEqual(update.mock.calls[1]?.arguments, [
    {
      knowledgeBaseId: 'kb-1',
      documentId: 'document-1',
      requestedGeneration: '2',
      activeDocumentIndexId: 'index-1',
    },
    { activeDocumentIndexId: 'index-2', updatedAt: knowledgeBaseDocumentActivationQO.updatedAt },
  ])
})
