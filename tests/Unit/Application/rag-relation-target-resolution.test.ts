import assert from 'node:assert/strict'
import test from 'node:test'

import { RetrieveRagUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-rag.use-case.js'

const resolveRagRelationTargets = RetrieveRagUseCase.prototype['resolveRelationTargets'].bind(
  RetrieveRagUseCase.prototype,
)

const resolveTarget = (relationType: 'markdown_link' | 'wiki_link', targetPaths: string[], targetReference: string) => {
  const documents = [
    { id: 'source', sourcePath: 'guides/start.md' },
    ...targetPaths.map((sourcePath, index) => ({ id: `target-${index}`, sourcePath })),
  ]
  const indexes = documents.map((document) => ({
    id: `${document.id}-index`,
    documentId: document.id,
    readyAt: new Date('2026-01-01T00:00:00.000Z'),
  }))
  const projectMembers = documents.map((document) => ({
    documentId: document.id,
    activeDocumentIndexId: `${document.id}-index`,
  }))

  return resolveRagRelationTargets({
    relations: [
      {
        id: 'relation',
        sourceIndexId: 'source-index',
        targetReference,
        targetAnchor: null,
        relationType,
      },
    ],
    projectMembers,
    eligibleTargetIndexIds: indexes.map((index) => index.id),
    documents,
    indexes,
    relationTargetChunks: [],
  }).get('relation')
}

test('wiki target paths resolve from the vault root before member-path fallback', () => {
  const result = resolveTarget(
    'wiki_link',
    ['Nest/06 - Coding Style.md', 'guides/Nest/06 - Coding Style.md'],
    'Nest/06 - Coding Style',
  )

  assert.equal(result?.resolution, 'resolved')
  assert.equal(result?.targetDocumentId, 'target-0')
  assert.equal(result?.candidateCount, 1)
  assert.equal(result?.relationType, 'wiki_link')
})

test('wiki target paths use a unique member-path suffix when the vault-root path is absent', () => {
  const result = resolveTarget('wiki_link', ['guides/Nest/06 - Coding Style.md'], 'Nest/06 - Coding Style')

  assert.equal(result?.resolution, 'resolved')
  assert.equal(result?.targetDocumentId, 'target-0')
  assert.equal(result?.candidateCount, 1)
})

test('wiki target paths remain ambiguous when multiple member paths share the suffix', () => {
  const result = resolveTarget(
    'wiki_link',
    ['guides/Nest/06 - Coding Style.md', 'archive/Nest/06 - Coding Style.md'],
    'Nest/06 - Coding Style',
  )

  assert.equal(result?.resolution, 'ambiguous')
  assert.equal(result?.targetDocumentId, null)
  assert.equal(result?.candidateCount, 2)
})

test('markdown links stay relative to the source document directory', () => {
  const result = resolveTarget('markdown_link', ['guides/next.md', 'next.md'], 'next.md')

  assert.equal(result?.resolution, 'resolved')
  assert.equal(result?.targetDocumentId, 'target-0')
  assert.equal(result?.candidateCount, 1)
})

test('a missing or external target is reported without trusting a persisted target hint', () => {
  assert.equal(resolveTarget('markdown_link', ['guides/next.md'], 'missing.md')?.resolution, 'missing')
  assert.equal(resolveTarget('markdown_link', ['guides/next.md'], 'https://example.com/next.md')?.targetIndexId, null)
})

test('an unresolved heading does not expand the uniquely matched target document', () => {
  const result = resolveTarget('markdown_link', ['guides/next.md'], 'next.md#missing-heading')
  assert.equal(result?.resolution, 'missing')
  assert.equal(result?.targetDocumentId, 'target-0')
  assert.equal(result?.targetIndexId, null)
})
