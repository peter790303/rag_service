import assert from 'node:assert/strict'
import test from 'node:test'

import type { EntityManager, Repository } from 'typeorm'

import { RagDocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/rag-document-revision.model.js'
import { TypeOrmRagDocumentRevisionRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-document-revision.repository.js'

test('findOrCreate keeps an existing revision immutable when content hash matches', async () => {
  const existingRevision = {
    id: 'revision-1',
    documentId: 'document-1',
    contentSha256: 'same-hash',
    title: 'title captured with this revision',
    content: '# original content',
  } as RagDocumentRevisionModel
  let saveCalled = false
  let createCalled = false

  const revisionRepository = {
    findOneBy: async (where: { documentId: string; contentSha256: string }) => {
      assert.deepEqual(where, { documentId: 'document-1', contentSha256: 'same-hash' })

      return existingRevision
    },
    create: () => {
      createCalled = true

      return {} as RagDocumentRevisionModel
    },
    save: async () => {
      saveCalled = true

      return {} as RagDocumentRevisionModel
    },
  } as unknown as Repository<RagDocumentRevisionModel>
  const manager = {
    getRepository: (model: typeof RagDocumentRevisionModel) => {
      assert.equal(model, RagDocumentRevisionModel)

      return revisionRepository
    },
  } as unknown as EntityManager
  const repository = new TypeOrmRagDocumentRevisionRepository({} as Repository<RagDocumentRevisionModel>)

  const result = await repository.findOrCreate(
    manager,
    'document-1',
    'same-hash',
    'new current title',
    '# same content',
  )

  assert.equal(result, existingRevision)
  assert.equal(result.title, 'title captured with this revision')
  assert.equal(result.content, '# original content')
  assert.equal(createCalled, false)
  assert.equal(saveCalled, false)
})
