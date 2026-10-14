import assert from 'node:assert/strict'
import test from 'node:test'

import { DataSource, EntityManager, In, type DeepPartial } from 'typeorm'

import type { PlannedRelation } from '../../../src/Domain/Knowledge/markdown-chunk.factory.js'
import { RagDocumentRelationModel } from '../../../src/Infrastructure/Persistence/Models/rag-document-relation.model.js'
import { TypeOrmRagDocumentRelationRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-document-relation.repository.js'

const createManager = (): EntityManager => new EntityManager(new DataSource({ type: 'postgres' }))

const plannedRelation: PlannedRelation = {
  targetReference: '../target.md',
  targetAnchor: 'required-section',
  relationType: 'requires',
  evidenceBlockStart: 2,
  evidenceBlockEnd: 4,
  evidenceText: 'Requires [target](../target.md#required-section).',
}

test('relation inserts whitelist planned fields and preserve the source index identity', async (context) => {
  const manager = createManager()
  const modelRepository = manager.getRepository(RagDocumentRelationModel)
  const create = context.mock.method(modelRepository, 'create', (row: DeepPartial<RagDocumentRelationModel>) =>
    Object.assign(new RagDocumentRelationModel(), row),
  )
  const save = context.mock.method(modelRepository, 'save', async () => [])
  const untrustedExtraFields = {
    ...plannedRelation,
    id: 'upstream-id',
    sourceIndexId: 'upstream-index',
    targetDocumentId: 'upstream-target',
    sourceIndex: { id: 'upstream-index' },
  }

  await new TypeOrmRagDocumentRelationRepository().savePlannedIn(manager, 'owned-index', [untrustedExtraFields])

  const expectedWrite = {
    sourceIndexId: 'owned-index',
    targetDocumentId: null,
    targetReference: '../target.md',
    targetAnchor: 'required-section',
    relationType: 'requires',
    evidenceBlockStart: 2,
    evidenceBlockEnd: 4,
    evidenceText: plannedRelation.evidenceText,
  }
  assert.deepEqual(create.mock.calls[0]?.arguments, [expectedWrite])
  assert.deepEqual(save.mock.calls[0]?.arguments, [[Object.assign(new RagDocumentRelationModel(), expectedWrite)]])
})

test('empty relation writes and source-index lookups skip persistence', async (context) => {
  const manager = createManager()
  const getRepository = context.mock.method(manager, 'getRepository', () => {
    throw new Error('empty relation operations must not query a model')
  })
  const repository = new TypeOrmRagDocumentRelationRepository()

  await repository.savePlannedIn(manager, 'owned-index', [])
  assert.deepEqual(await repository.findForSourceIndexIdsIn(manager, []), [])
  assert.equal(getRepository.mock.callCount(), 0)
})

test('relation lookups and target-reference counts query only the relation model', async (context) => {
  const manager = createManager()
  const modelRepository = manager.getRepository(RagDocumentRelationModel)
  const row = Object.assign(new RagDocumentRelationModel(), { id: 'relation-1', sourceIndexId: 'index-1' })
  const findBy = context.mock.method(modelRepository, 'findBy', async () => [row])
  const find = context.mock.method(modelRepository, 'find', async () => [row])
  const countBy = context.mock.method(modelRepository, 'countBy', async () => 3)
  const repository = new TypeOrmRagDocumentRelationRepository()

  assert.deepEqual(await repository.findForIndex(manager, 'index-1'), [row])
  assert.deepEqual(await repository.findForSourceIndexIdsIn(manager, ['index-1', 'index-2']), [row])
  assert.equal(await repository.countTargetDocumentReferencesIn(manager, 'document-1'), 3)
  assert.deepEqual(findBy.mock.calls[0]?.arguments, [{ sourceIndexId: 'index-1' }])
  assert.deepEqual(find.mock.calls[0]?.arguments, [
    { where: { sourceIndexId: In(['index-1', 'index-2']) }, order: { id: 'ASC' } },
  ])
  assert.deepEqual(countBy.mock.calls[0]?.arguments, [{ targetDocumentId: 'document-1' }])
})

test('relation deletion removes only rows belonging to the requested source index', async (context) => {
  const manager = createManager()
  const modelRepository = manager.getRepository(RagDocumentRelationModel)
  const row = Object.assign(new RagDocumentRelationModel(), { id: 'relation-1', sourceIndexId: 'index-1' })
  let existingRows: RagDocumentRelationModel[] = []
  const findBy = context.mock.method(modelRepository, 'findBy', async () => existingRows)
  const remove = context.mock.method(modelRepository, 'remove', async () => [])
  const repository = new TypeOrmRagDocumentRelationRepository()

  await repository.removeForIndex(manager, 'index-1')
  assert.equal(remove.mock.callCount(), 0)
  existingRows = [row]
  await repository.removeForIndex(manager, 'index-1')
  assert.deepEqual(
    findBy.mock.calls.map((call) => call.arguments),
    [[{ sourceIndexId: 'index-1' }], [{ sourceIndexId: 'index-1' }]],
  )
  assert.deepEqual(remove.mock.calls[0]?.arguments, [[row]])
})
