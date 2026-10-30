import assert from 'node:assert/strict'
import test from 'node:test'

import { DataSource } from 'typeorm'

import { DocumentRevision } from '../../../src/Documents/Domain/Entities/document-revision.ts'
import { DocumentRevisionModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { DocumentRevisionRepository } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Repositories/document-revision.repository.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'

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
  assert.deepEqual(persistedRevision.capturedAt.nativeDate, existingRevision.capturedAt)
  assert.deepEqual(persistedRevision.createdAt.nativeDate, existingRevision.createdAt)
  existingRevision.createdAt.setTime(0)
  assert.deepEqual(persistedRevision.createdAt.nativeDate, new Date('2026-10-01T02:00:00.000Z'))
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
  const dataSource = new DataSource({ type: 'postgres' })
  const modelRepository = dataSource.getRepository(DocumentRevisionModel)
  const lookup = context.mock.method(modelRepository, 'findOneBy', async () => {
    throw new Error('revision creation must not decide whether a revision exists')
  })
  const insert = context.mock.method(modelRepository, 'insert', async () => ({
    identifiers: [],
    generatedMaps: [],
    raw: [],
  }))

  const persistedRevision = await new DocumentRevisionRepository(new PersistenceTransaction(dataSource)).create(
    createDocumentRevisionQO,
  )

  assert.equal(persistedRevision, undefined)
  assert.deepEqual(insert.mock.calls[0]?.arguments, [createDocumentRevisionQO])
  assert.equal(lookup.mock.callCount(), 0)
})
