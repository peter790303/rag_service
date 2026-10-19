import assert from 'node:assert/strict'
import test from 'node:test'

import { InvalidKnowledgeBaseDocumentIndexGenerationException } from '../../../../src/Domain/KnowledgeBaseDocument/Exceptions/invalid-knowledge-base-document-index-generation.exception.ts'
import { InvalidKnowledgeBaseDocumentStateException } from '../../../../src/Domain/KnowledgeBaseDocument/Exceptions/invalid-knowledge-base-document-state.exception.ts'
import {
  KnowledgeBaseDocument,
  type KnowledgeBaseDocumentState,
} from '../../../../src/Domain/KnowledgeBaseDocument/knowledge-base-document.ts'

const restoreKnowledgeBaseDocument = (requestedGeneration = '8'): KnowledgeBaseDocument =>
  new KnowledgeBaseDocument({
    knowledgeBaseId: 'knowledge-base-1',
    documentId: 'document-1',
    requestedGeneration,
    activeDocumentIndexId: 'index-1',
    isEntry: true,
    alwaysIncludeFullContent: false,
    updatedAt: new Date('2026-10-09T00:00:00.000Z'),
  })

test('retaining an index request generation preserves knowledgeBaseDocument identity and selects its active index', () => {
  const knowledgeBaseDocument = restoreKnowledgeBaseDocument()
  const requested = knowledgeBaseDocument.requestIndex({ generation: '8', activeDocumentIndexId: 'index-2' })

  assert.equal(requested.knowledgeBaseId, 'knowledge-base-1')
  assert.equal(requested.documentId, 'document-1')
  assert.equal(requested.requestedGeneration, '8')
  assert.equal(requested.activeDocumentIndexId, 'index-2')
  assert.equal(requested.isEntry, true)
  assert.equal(requested.alwaysIncludeFullContent, false)
  assert.equal(requested.updatedAt.equals(knowledgeBaseDocument.updatedAt), true)
  assert.equal(knowledgeBaseDocument.activeDocumentIndexId, 'index-1')
})

test('advancing an index request uses exact integer precision beyond Number.MAX_SAFE_INTEGER', () => {
  const knowledgeBaseDocument = restoreKnowledgeBaseDocument('9007199254740992')
  const requested = knowledgeBaseDocument.requestIndex({ generation: '9007199254740993', activeDocumentIndexId: null })

  assert.equal(requested.requestedGeneration, '9007199254740993')
  assert.equal(requested.activeDocumentIndexId, null)
  assert.equal(knowledgeBaseDocument.requestedGeneration, '9007199254740992')
})

test('a previous generation is rejected without changing knowledgeBaseDocument state', () => {
  const knowledgeBaseDocument = restoreKnowledgeBaseDocument()

  assert.throws(
    () => knowledgeBaseDocument.requestIndex({ generation: '7', activeDocumentIndexId: null }),
    (error: unknown) => {
      assert.ok(error instanceof InvalidKnowledgeBaseDocumentIndexGenerationException)
      assert.equal(error.code, 'INVALID_MEMBERSHIP_INDEX_GENERATION')
      assert.deepEqual(error.context, { currentGeneration: '8', requestedGeneration: '7' })

      return true
    },
  )
  assert.equal(knowledgeBaseDocument.requestedGeneration, '8')
  assert.equal(knowledgeBaseDocument.activeDocumentIndexId, 'index-1')
})

test('skipping a generation is rejected even above Number.MAX_SAFE_INTEGER', () => {
  const knowledgeBaseDocument = restoreKnowledgeBaseDocument('9007199254740992')

  assert.throws(
    () => knowledgeBaseDocument.requestIndex({ generation: '9007199254740994', activeDocumentIndexId: null }),
    InvalidKnowledgeBaseDocumentIndexGenerationException,
  )
})

test('required knowledgeBaseDocument state cannot be erased by a missing field', () => {
  const validState: KnowledgeBaseDocumentState = {
    knowledgeBaseId: 'knowledge-base-1',
    documentId: 'document-1',
    requestedGeneration: '0',
    activeDocumentIndexId: null,
    isEntry: false,
    alwaysIncludeFullContent: false,
    updatedAt: new Date(0),
  }

  Object.keys(validState).forEach((field) => {
    assert.throws(
      () => new KnowledgeBaseDocument({ ...validState, [field]: undefined }),
      InvalidKnowledgeBaseDocumentStateException,
    )
  })
  const knowledgeBaseDocument = new KnowledgeBaseDocument(validState)
  assert.equal(knowledgeBaseDocument.requestedGeneration, '0')
  assert.equal(knowledgeBaseDocument.activeDocumentIndexId, null)
  assert.equal(knowledgeBaseDocument.isEntry, false)
  assert.equal(knowledgeBaseDocument.updatedAt.epochMilliseconds, 0)
})

test('knowledgeBaseDocument configuration preserves omitted flags, applies false, and rejects null', () => {
  const knowledgeBaseDocument = restoreKnowledgeBaseDocument()
  assert.equal(knowledgeBaseDocument.configure({}, knowledgeBaseDocument.updatedAt).isEntry, true)
  assert.equal(knowledgeBaseDocument.configure({ isEntry: false }, knowledgeBaseDocument.updatedAt).isEntry, false)
  assert.throws(
    () =>
      knowledgeBaseDocument.configure(
        { isEntry: null } as unknown as { isEntry: boolean },
        knowledgeBaseDocument.updatedAt,
      ),
    InvalidKnowledgeBaseDocumentStateException,
  )
})
