import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

import { DataSource, EntityManager, In, IsNull, LessThanOrEqual } from 'typeorm'

import { Document } from '../../../src/Domain/Document/document.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { DocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/document.repository.ts'

const sourceIdentity = { sourceType: 'repository', sourceKey: 'repo-a', sourcePath: 'docs/page.md' }
const candidateSource = { ...sourceIdentity, id: 'candidate-id', createdAt: new Date('2026-10-16T00:00:00.000Z') }
const conflictOptions = {
  conflictPaths: { sourceType: true, sourceKey: true, sourcePath: true },
  skipUpdateIfNoValuesChanged: false,
}
const createRepositoryManagerStub = (): EntityManager => new EntityManager(new DataSource({ type: 'postgres' }))

const createDocumentRepository = (context: TestContext, currentTitle: string | null) => {
  const manager = createRepositoryManagerStub()
  const documentModelRepository = manager.getRepository(DocumentModel)
  const document = Object.assign(new DocumentModel(), {
    ...sourceIdentity,
    id: 'document-1',
    currentTitle,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    unreferencedSince: null,
  })
  const upsert = context.mock.method(documentModelRepository, 'upsert', async () => ({
    identifiers: [],
    generatedMaps: [],
    raw: [],
  }))
  const findOneByOrFail = context.mock.method(documentModelRepository, 'findOneByOrFail', async () => document)

  const persistenceTransaction = new PersistenceTransaction({ manager } as DataSource)

  return {
    manager,
    transaction: persistenceTransaction,
    modelRepository: documentModelRepository,
    document,
    upsert,
    findOneByOrFail,
    repository: new DocumentRepository(persistenceTransaction),
  }
}

test('upsertBySourceTypeAndSourceKeyAndSourcePath omits an unspecified title and keeps conflict updates enabled for row locking', async (context) => {
  const fixture = createDocumentRepository(context, 'latest title')

  const document = await fixture.repository.upsertBySourceTypeAndSourceKeyAndSourcePath({
    ...candidateSource,
    unreferencedSince: null,
  })

  assert.ok(document instanceof Document)
  assert.notEqual(document, fixture.document)
  assert.equal(document.currentTitle, fixture.document.currentTitle)
  assert.deepEqual(document.createdAt.nativeDate, fixture.document.createdAt)
  assert.deepEqual(fixture.upsert.mock.calls[0]?.arguments, [
    { ...candidateSource, unreferencedSince: null },
    conflictOptions,
  ])
  assert.deepEqual(fixture.findOneByOrFail.mock.calls[0]?.arguments, [sourceIdentity])
})

test('upsertTitleBySourceTypeAndSourceKeyAndSourcePath includes a supplied title without changing the source identity conflict target', async (context) => {
  const fixture = createDocumentRepository(context, 'renamed title')

  const document = await fixture.repository.upsertTitleBySourceTypeAndSourceKeyAndSourcePath({
    ...candidateSource,
    unreferencedSince: null,
    currentTitle: 'renamed title',
  })

  assert.ok(document instanceof Document)
  assert.notEqual(document, fixture.document)
  assert.equal(document.currentTitle, fixture.document.currentTitle)
  assert.deepEqual(document.createdAt.nativeDate, fixture.document.createdAt)
  assert.deepEqual(fixture.upsert.mock.calls[0]?.arguments, [
    { ...candidateSource, unreferencedSince: null, currentTitle: 'renamed title' },
    conflictOptions,
  ])
})

test('upsertTitleBySourceTypeAndSourceKeyAndSourcePath stores caller-supplied lifecycle values and an explicit null title', async (context) => {
  const fixture = createDocumentRepository(context, null)
  const unreferencedSince = new Date('2026-10-14T00:00:00.000Z')

  await fixture.repository.upsertTitleBySourceTypeAndSourceKeyAndSourcePath({
    ...candidateSource,
    unreferencedSince,
    currentTitle: null,
  })

  assert.deepEqual(fixture.upsert.mock.calls[0]?.arguments, [
    { ...candidateSource, unreferencedSince, currentTitle: null },
    conflictOptions,
  ])
})

test('upsertBySourceTypeAndSourceKeyAndSourcePath performs both the conflict write and identity read on the caller transaction manager', async (context) => {
  const fixture = createDocumentRepository(context, null)
  const transactionManager = createRepositoryManagerStub()
  const documentModelRepository = transactionManager.getRepository(DocumentModel)
  const upsert = context.mock.method(documentModelRepository, 'upsert', async () => ({
    identifiers: [],
    generatedMaps: [],
    raw: [],
  }))
  const findOneByOrFail = context.mock.method(documentModelRepository, 'findOneByOrFail', async () => fixture.document)

  const document = await fixture.transaction.bind(transactionManager, () =>
    fixture.repository.upsertBySourceTypeAndSourceKeyAndSourcePath({
      ...candidateSource,
      unreferencedSince: null,
    }),
  )

  assert.ok(document instanceof Document)
  assert.notEqual(document, fixture.document)
  assert.equal(document.currentTitle, fixture.document.currentTitle)
  assert.deepEqual(document.createdAt.nativeDate, fixture.document.createdAt)
  assert.equal(fixture.upsert.mock.callCount(), 0)
  assert.equal(fixture.findOneByOrFail.mock.callCount(), 0)
  assert.deepEqual(upsert.mock.calls[0]?.arguments, [{ ...candidateSource, unreferencedSince: null }, conflictOptions])
  assert.deepEqual(findOneByOrFail.mock.calls[0]?.arguments, [sourceIdentity])
})

test('document locks keep the requested ID and distinguish blocking from skip-locked acquisition', async (context) => {
  const fixture = createDocumentRepository(context, null)
  const findOne = context.mock.method(fixture.modelRepository, 'findOne', async () => null)

  assert.equal(await fixture.repository.lockByDocumentId({ documentId: 'document-1' }), null)
  assert.equal(await fixture.repository.lockByDocumentIdSkipLocked({ documentId: 'document-2' }), null)

  assert.deepEqual(findOne.mock.calls[0]?.arguments, [
    { where: { id: 'document-1' }, lock: { mode: 'pessimistic_write' } },
  ])
  assert.deepEqual(findOne.mock.calls[1]?.arguments, [
    { where: { id: 'document-2' }, lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' } },
  ])
})

test('empty document ID lookups return without accessing persistence', async (context) => {
  const fixture = createDocumentRepository(context, null)
  const getRepository = context.mock.method(fixture.manager, 'getRepository', () => {
    throw new Error('empty IDs must not query documents')
  })

  assert.deepEqual(await fixture.repository.findByDocumentIds({ ids: [] }), [])
  assert.equal(getRepository.mock.callCount(), 0)
})

test('document ID and garbage lookups stay scoped and marking unreferenced keeps its null condition', async (context) => {
  const fixture = createDocumentRepository(context, null)
  const cutoff = new Date('2026-10-14T00:00:00.000Z')
  const findBy = context.mock.method(fixture.modelRepository, 'findBy', async () => [fixture.document])
  const update = context.mock.method(fixture.modelRepository, 'update', async () => ({ affected: 1, raw: [] }))
  const deleteDocument = context.mock.method(fixture.modelRepository, 'delete', async () => ({ affected: 1, raw: [] }))

  const foundDocuments = await fixture.repository.findByDocumentIds({ ids: ['document-1'] })
  assert.equal(foundDocuments.length, 1)
  assert.ok(foundDocuments[0] instanceof Document)
  assert.equal(foundDocuments[0].id, fixture.document.id)
  const expiredDocuments = await fixture.repository.findByUnreferencedSinceLessThanOrEqual({ cutoff })
  assert.equal(expiredDocuments.length, 1)
  assert.ok(expiredDocuments[0] instanceof Document)
  assert.equal(expiredDocuments[0].id, fixture.document.id)
  await fixture.repository.updateUnreferencedSinceByDocumentIdAndUnreferencedSinceIsNull({
    documentId: 'document-1',
    unreferencedSince: cutoff,
  })
  await fixture.repository.deleteByDocumentId({ documentId: 'document-1' })

  assert.deepEqual(findBy.mock.calls[0]?.arguments, [{ id: In(['document-1']) }])
  assert.deepEqual(findBy.mock.calls[1]?.arguments, [{ unreferencedSince: LessThanOrEqual(cutoff) }])
  assert.deepEqual(update.mock.calls[0]?.arguments, [
    { id: 'document-1', unreferencedSince: IsNull() },
    { unreferencedSince: cutoff },
  ])
  assert.deepEqual(deleteDocument.mock.calls[0]?.arguments, [{ id: 'document-1' }])
})
