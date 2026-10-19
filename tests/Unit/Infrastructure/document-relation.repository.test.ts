import assert from 'node:assert/strict'
import test from 'node:test'

import { DataSource, type EntityManager, In } from 'typeorm'

import type { PlannedDocumentRelation } from '../../../src/Application/DocumentRelations/DataTransferObjects/planned-document-relation.dto.ts'
import { ReplacePlannedDocumentRelationsUseCase } from '../../../src/Application/DocumentRelations/UseCases/replace-planned-document-relations.use-case.ts'
import { DocumentRelation } from '../../../src/Domain/DocumentRelation/document-relation.ts'
import { DocumentRelationModel } from '../../../src/Infrastructure/Persistence/Models/document-relation.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { DocumentRelationRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-relation.repository.ts'

const createRepositoryManagerStub = (): EntityManager => new DataSource({ type: 'postgres' }).manager

const plannedRelation: PlannedDocumentRelation = {
  targetReference: '../target.md',
  targetAnchor: 'required-section',
  relationType: 'requires',
  evidenceBlockStart: 2,
  evidenceBlockEnd: 4,
  evidenceText: 'Requires [target](../target.md#required-section).',
}

test('relation inserts whitelist planned fields and preserve the source index identity', async (context) => {
  const manager = createRepositoryManagerStub()
  const documentRelationModelRepository = manager.getRepository(DocumentRelationModel)
  const save = context.mock.method(documentRelationModelRepository, 'insert', async () => ({
    identifiers: [],
    generatedMaps: [],
    raw: [],
  }))
  const untrustedExtraFields = {
    ...plannedRelation,
    id: 'upstream-id',
    sourceIndexId: 'upstream-index',
    targetDocumentId: 'upstream-target',
    sourceIndex: { id: 'upstream-index' },
  }

  const deleteRows = context.mock.method(documentRelationModelRepository, 'delete', async () => ({
    affected: 1,
    raw: [],
  }))
  await new ReplacePlannedDocumentRelationsUseCase(
    new DocumentRelationRepository(new PersistenceTransaction(manager.connection)),
  ).execute({ documentIndexId: 'owned-index', plannedDocumentRelations: [untrustedExtraFields] })
  assert.deepEqual(deleteRows.mock.calls[0]?.arguments, [{ sourceIndexId: 'owned-index' }])
  const savedRelations = save.mock.calls[0]?.arguments[0]
  assert.ok(Array.isArray(savedRelations))
  assert.equal(savedRelations.length, 1)
  const savedRelation = savedRelations[0]
  assert.ok(savedRelation)
  assert.equal(typeof savedRelation.id, 'string')
  assert.ok(typeof savedRelation.id === 'string')
  assert.match(savedRelation.id, /^[0-9a-f-]{36}$/)
  assert.notEqual(savedRelation.id, 'upstream-id')

  const expectedWrite = {
    id: savedRelation.id,
    sourceIndexId: 'owned-index',
    targetDocumentId: null,
    targetReference: '../target.md',
    targetAnchor: 'required-section',
    relationType: 'requires',
    evidenceBlockStart: 2,
    evidenceBlockEnd: 4,
    evidenceText: plannedRelation.evidenceText,
  }
  assert.deepEqual(save.mock.calls[0]?.arguments, [[expectedWrite]])
})

test('empty relation writes and source-index lookups skip persistence', async (context) => {
  const manager = createRepositoryManagerStub()
  const getRepository = context.mock.method(manager, 'getRepository', () => {
    throw new Error('empty relation operations must not query a model')
  })
  const documentRelationRepository = new DocumentRelationRepository(new PersistenceTransaction(manager.connection))

  await documentRelationRepository.insertPlanned({ relations: [] })
  assert.deepEqual(await documentRelationRepository.findBySourceIndexIdsOrderByIdAsc({ sourceIndexIds: [] }), [])
  assert.equal(getRepository.mock.callCount(), 0)
})

test('relation lookups and target-reference reads query only the relation model', async (context) => {
  const manager = createRepositoryManagerStub()
  const documentRelationModelRepository = manager.getRepository(DocumentRelationModel)
  const persistedDocumentRelationModel = Object.assign(new DocumentRelationModel(), {
    ...plannedRelation,
    id: 'relation-1',
    sourceIndexId: 'index-1',
    targetDocumentId: 'document-1',
  })
  const findBy = context.mock.method(documentRelationModelRepository, 'findBy', async () => [
    persistedDocumentRelationModel,
  ])
  const find = context.mock.method(documentRelationModelRepository, 'find', async () => [
    persistedDocumentRelationModel,
  ])
  const findOneBy = context.mock.method(
    documentRelationModelRepository,
    'findOneBy',
    async () => persistedDocumentRelationModel,
  )
  const documentRelationRepository = new DocumentRelationRepository(new PersistenceTransaction(manager.connection))

  const relations = await documentRelationRepository.findBySourceIndexId({ sourceIndexId: 'index-1' })
  const orderedRelations = await documentRelationRepository.findBySourceIndexIdsOrderByIdAsc({
    sourceIndexIds: ['index-1', 'index-2'],
  })
  const targetRelation = await documentRelationRepository.findByTargetDocumentId({ documentId: 'document-1' })
  assert.equal(relations.length, 1)
  assert.equal(orderedRelations.length, 1)
  const testCases = [...relations, ...orderedRelations, targetRelation]
  testCases.forEach((relation) => {
    assert.ok(relation instanceof DocumentRelation)
    assert.equal(relation.id, 'relation-1')
    assert.equal(relation.sourceIndexId, 'index-1')
    assert.equal(relation.targetDocumentId, 'document-1')
    assert.equal(relation.targetReference, plannedRelation.targetReference)
    assert.equal(relation.targetAnchor, plannedRelation.targetAnchor)
    assert.equal(relation.relationType, plannedRelation.relationType)
    assert.equal(relation.evidenceBlockStart, plannedRelation.evidenceBlockStart)
    assert.equal(relation.evidenceBlockEnd, plannedRelation.evidenceBlockEnd)
    assert.equal(relation.evidenceText, plannedRelation.evidenceText)
  })
  assert.deepEqual(findBy.mock.calls[0]?.arguments, [{ sourceIndexId: 'index-1' }])
  assert.deepEqual(find.mock.calls[0]?.arguments, [
    { where: { sourceIndexId: In(['index-1', 'index-2']) }, order: { id: 'ASC' } },
  ])
  assert.deepEqual(findOneBy.mock.calls[0]?.arguments, [{ targetDocumentId: 'document-1' }])
})

test('relation deletion removes only rows belonging to the requested source index', async (context) => {
  const manager = createRepositoryManagerStub()
  const documentRelationModelRepository = manager.getRepository(DocumentRelationModel)
  const findBy = context.mock.method(documentRelationModelRepository, 'findBy', async () => {
    throw new Error('relation deletion must not read the rows first')
  })
  const remove = context.mock.method(documentRelationModelRepository, 'remove', async () => {
    throw new Error('relation deletion must issue a scoped delete')
  })
  const deleteRows = context.mock.method(documentRelationModelRepository, 'delete', async () => ({
    affected: 2,
    raw: [],
  }))
  const documentRelationRepository = new DocumentRelationRepository(new PersistenceTransaction(manager.connection))

  await documentRelationRepository.removeBySourceIndexId({ sourceIndexId: 'index-1' })
  assert.equal(findBy.mock.callCount(), 0)
  assert.equal(remove.mock.callCount(), 0)
  assert.deepEqual(deleteRows.mock.calls[0]?.arguments, [{ sourceIndexId: 'index-1' }])
})
