import assert from 'node:assert/strict'
import test from 'node:test'

import { createDocumentFixture, createRepositoryStub } from './document-index-lifecycle.fixture.ts'
import type { DocumentRevisionRepository } from '../../../src/Application/DocumentRevisions/Contracts/document-revision.repository.ts'
import { CollectDocumentRevisionGarbageUseCase } from '../../../src/Application/DocumentRevisions/UseCases/collect-document-revision-garbage.use-case.ts'
import type { DocumentRepository } from '../../../src/Application/Documents/Contracts/document.repository.ts'
import { LockDocumentRetentionParentsUseCase } from '../../../src/Application/Documents/UseCases/lock-document-retention-parents.use-case.ts'
import { DocumentRevision } from '../../../src/Domain/DocumentRevision/document-revision.ts'

const createExpiredRevision = (id: string): DocumentRevision =>
  new DocumentRevision({
    id,
    documentId: 'document-1',
    contentSha256: 'a'.repeat(64),
    title: null,
    content: '',
    capturedAt: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date('2026-10-01T00:00:00Z'),
  })

const scope = {
  retentionCutoff: new Date('2026-10-18T00:00:00Z'),
  lockedDocumentIds: ['document-1'],
}

test('parent retention locks await each sorted unique ID and omit missing documents', async () => {
  const calls: string[] = []
  let pendingDocumentId: string | null = null
  const documentRepository = createRepositoryStub<DocumentRepository>({
    async lockByDocumentId(documentIdQO) {
      assert.equal(pendingDocumentId, null)
      pendingDocumentId = documentIdQO.documentId
      calls.push(`start:${documentIdQO.documentId}`)
      await new Promise<void>((resolve) => setImmediate(resolve))
      calls.push(`finish:${documentIdQO.documentId}`)
      pendingDocumentId = null

      return documentIdQO.documentId === 'document-2' ? null : createDocumentFixture({ id: documentIdQO.documentId })
    },
  })
  const useCase = new LockDocumentRetentionParentsUseCase(documentRepository)

  const documents = await useCase.execute({
    documentIds: ['document-3', 'document-1', 'document-2', 'document-1'],
  })

  assert.deepEqual(
    documents.map((document) => document.id),
    ['document-1', 'document-3'],
  )
  assert.deepEqual(calls, [
    'start:document-1',
    'finish:document-1',
    'start:document-2',
    'finish:document-2',
    'start:document-3',
    'finish:document-3',
  ])
})

test('parent retention locks complete an empty batch without accessing persistence', async () => {
  const documentRepository = createRepositoryStub<DocumentRepository>({
    lockByDocumentId() {
      assert.fail('an empty parent batch must not lock documents')
    },
  })
  const useCase = new LockDocumentRetentionParentsUseCase(documentRepository)

  assert.deepEqual(await useCase.execute({ documentIds: [] }), [])
})

test('parent retention lock failure stops later IDs and propagates the original error', async () => {
  const calls: string[] = []
  const failure = new Error('parent lock failed')
  const documentRepository = createRepositoryStub<DocumentRepository>({
    async lockByDocumentId(documentIdQO) {
      calls.push(documentIdQO.documentId)
      await new Promise<void>((resolve) => setImmediate(resolve))

      if (documentIdQO.documentId === 'document-2') {
        throw failure
      }

      return createDocumentFixture({ id: documentIdQO.documentId })
    },
  })
  const useCase = new LockDocumentRetentionParentsUseCase(documentRepository)

  await assert.rejects(
    useCase.execute({ documentIds: ['document-3', 'document-2', 'document-1'] }),
    (error: unknown) => error === failure,
  )
  assert.deepEqual(calls, ['document-1', 'document-2'])
})

test('revision garbage collection finishes each candidate in supplied order and omits missing revisions', async () => {
  const candidates = [
    createExpiredRevision('revision-b'),
    createExpiredRevision('revision-a'),
    createExpiredRevision('revision-c'),
  ]
  const calls: string[] = []
  let pendingOperation: string | null = null
  const recordOperation = async (operation: string): Promise<void> => {
    assert.equal(pendingOperation, null)
    pendingOperation = operation
    calls.push(`start:${operation}`)
    await new Promise<void>((resolve) => setImmediate(resolve))
    calls.push(`finish:${operation}`)
    pendingOperation = null
  }
  const documentRevisionRepository = createRepositoryStub<DocumentRevisionRepository>({
    async lockByDocumentRevisionId(documentRevisionIdQO) {
      await recordOperation(`lock:${documentRevisionIdQO.revisionId}`)

      return documentRevisionIdQO.revisionId === 'revision-b'
        ? null
        : (candidates.find((candidate) => candidate.id === documentRevisionIdQO.revisionId) ?? null)
    },
    async deleteByDocumentRevisionId(documentRevisionIdQO) {
      await recordOperation(`delete:${documentRevisionIdQO.revisionId}`)
    },
  })
  const useCase = new CollectDocumentRevisionGarbageUseCase(documentRevisionRepository, {
    async execute(inspectDocumentIndexRetentionDTO) {
      assert.ok('revisionId' in inspectDocumentIndexRetentionDTO)
      await recordOperation(`retention:${inspectDocumentIndexRetentionDTO.revisionId}`)

      return null
    },
  })

  const revisions = await useCase.execute({ scope, candidates })

  assert.deepEqual(
    revisions.map((revision) => revision.id),
    ['revision-a', 'revision-c'],
  )
  assert.deepEqual(calls, [
    'start:lock:revision-b',
    'finish:lock:revision-b',
    'start:lock:revision-a',
    'finish:lock:revision-a',
    'start:retention:revision-a',
    'finish:retention:revision-a',
    'start:delete:revision-a',
    'finish:delete:revision-a',
    'start:lock:revision-c',
    'finish:lock:revision-c',
    'start:retention:revision-c',
    'finish:retention:revision-c',
    'start:delete:revision-c',
    'finish:delete:revision-c',
  ])
})

test('revision garbage collection deletion failure stops later candidates and propagates the original error', async () => {
  const candidates = [
    createExpiredRevision('revision-1'),
    createExpiredRevision('revision-2'),
    createExpiredRevision('revision-3'),
  ]
  const calls: string[] = []
  const failure = new Error('revision deletion failed')
  const documentRevisionRepository = createRepositoryStub<DocumentRevisionRepository>({
    async lockByDocumentRevisionId(documentRevisionIdQO) {
      calls.push(`lock:${documentRevisionIdQO.revisionId}`)

      return candidates.find((candidate) => candidate.id === documentRevisionIdQO.revisionId) ?? null
    },
    async deleteByDocumentRevisionId(documentRevisionIdQO) {
      calls.push(`delete:${documentRevisionIdQO.revisionId}`)
      await new Promise<void>((resolve) => setImmediate(resolve))

      if (documentRevisionIdQO.revisionId === 'revision-2') {
        throw failure
      }
    },
  })
  const useCase = new CollectDocumentRevisionGarbageUseCase(documentRevisionRepository, {
    async execute(inspectDocumentIndexRetentionDTO) {
      assert.ok('revisionId' in inspectDocumentIndexRetentionDTO)
      calls.push(`retention:${inspectDocumentIndexRetentionDTO.revisionId}`)

      return null
    },
  })

  await assert.rejects(useCase.execute({ scope, candidates }), (error: unknown) => error === failure)
  assert.deepEqual(calls, [
    'lock:revision-1',
    'retention:revision-1',
    'delete:revision-1',
    'lock:revision-2',
    'retention:revision-2',
    'delete:revision-2',
  ])
})
