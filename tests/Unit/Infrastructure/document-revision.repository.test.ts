import assert from 'node:assert/strict'
import test from 'node:test'

import { DataSource } from 'typeorm'

import { DocumentRevision } from '../../../src/Domain/DocumentRevision/document-revision.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { DocumentRevisionRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-revision.repository.ts'

function createPersistedRevision(): DocumentRevisionModel {
  return Object.assign(new DocumentRevisionModel(), {
    id: 'revision-1',
    documentId: 'document-1',
    contentSha256: 'a'.repeat(64),
    title: 'title captured with this revision',
    content: '# original content',
    capturedAt: new Date('2026-10-01T01:00:00.000Z'),
    createdAt: new Date('2026-10-01T02:00:00.000Z'),
  })
}

test('content-hash lookup returns the immutable revision without creating or saving', async (context) => {
  const existingRevision = createPersistedRevision()
  const dataSource = new DataSource({ type: 'postgres' })
  const revisionRepository = dataSource.getRepository(DocumentRevisionModel)
  const lookup = context.mock.method(revisionRepository, 'findOneBy', async () => existingRevision)
  const create = context.mock.method(revisionRepository, 'create', () => {
    throw new Error('content-hash lookup must not create a revision')
  })
  const save = context.mock.method(revisionRepository, 'save', async () => {
    throw new Error('content-hash lookup must not save a revision')
  })
  const documentRevisionRepository = new DocumentRevisionRepository(new PersistenceTransaction(dataSource))

  const persistedRevision = await documentRevisionRepository.findByDocumentIdAndContentSha256({
    documentId: 'document-1',
    contentSha256: existingRevision.contentSha256,
  })

  assert.deepEqual(lookup.mock.calls[0]?.arguments, [
    { documentId: 'document-1', contentSha256: existingRevision.contentSha256 },
  ])
  assert.ok(persistedRevision instanceof DocumentRevision)
  assert.notEqual(persistedRevision, existingRevision)
  assert.equal(persistedRevision.id, existingRevision.id)
  assert.equal(persistedRevision.documentId, existingRevision.documentId)
  assert.equal(persistedRevision.contentSha256, existingRevision.contentSha256)
  assert.equal(persistedRevision.title, 'title captured with this revision')
  assert.equal(persistedRevision.content, '# original content')
  assert.deepEqual(persistedRevision.capturedAt, existingRevision.capturedAt)
  assert.deepEqual(persistedRevision.createdAt, existingRevision.createdAt)
  existingRevision.createdAt.setTime(0)
  assert.deepEqual(persistedRevision.createdAt, new Date('2026-10-01T02:00:00.000Z'))
  assert.equal(create.mock.callCount(), 0)
  assert.equal(save.mock.callCount(), 0)
})

test('revision creation persists the supplied attributes without a content-hash lookup', async (context) => {
  const createDocumentRevisionQO = {
    id: 'revision-2',
    documentId: 'document-1',
    contentSha256: 'b'.repeat(64),
    title: 'captured title',
    content: '# new content',
    capturedAt: new Date('2026-10-02T01:00:00.000Z'),
    createdAt: new Date('2026-10-02T01:00:00.000Z'),
  }
  const model = Object.assign(createPersistedRevision(), createDocumentRevisionQO)
  const dataSource = new DataSource({ type: 'postgres' })
  const modelRepository = dataSource.getRepository(DocumentRevisionModel)
  const lookup = context.mock.method(modelRepository, 'findOneBy', async () => {
    throw new Error('revision creation must not decide whether a revision exists')
  })
  const save = context.mock.method(modelRepository, 'save', async () => model)

  const persistedRevision = await new DocumentRevisionRepository(new PersistenceTransaction(dataSource)).create(
    createDocumentRevisionQO,
  )

  assert.ok(persistedRevision instanceof DocumentRevision)
  assert.notEqual(persistedRevision, model)
  assert.equal(persistedRevision.id, model.id)
  assert.equal(persistedRevision.documentId, createDocumentRevisionQO.documentId)
  assert.equal(persistedRevision.contentSha256, createDocumentRevisionQO.contentSha256)
  assert.equal(persistedRevision.title, createDocumentRevisionQO.title)
  assert.equal(persistedRevision.content, createDocumentRevisionQO.content)
  assert.deepEqual(persistedRevision.capturedAt, model.capturedAt)
  assert.deepEqual(persistedRevision.createdAt, model.createdAt)
  assert.deepEqual(save.mock.calls[0]?.arguments, [createDocumentRevisionQO])
  assert.equal(lookup.mock.callCount(), 0)
})
