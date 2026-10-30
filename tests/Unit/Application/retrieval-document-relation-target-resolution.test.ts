import assert from 'node:assert/strict'
import test from 'node:test'

import { RetrieveKnowledgeBaseContentQueryHandler } from '../../../src/KnowledgeBases/Application/Queries/retrieve-knowledge-base-content.query.handler.ts'
import { DateTime } from '../../../src/Shared/Domain/ValueObjects/date-time.ts'

const resolveRetrievalDocumentRelationTargets = RetrieveKnowledgeBaseContentQueryHandler.prototype[
  'resolveRelationTargets'
].bind(RetrieveKnowledgeBaseContentQueryHandler.prototype)

const resolveDocumentRelationTarget = (
  relationType: 'markdown_link' | 'wiki_link',
  targetPaths: string[],
  targetReference: string,
) => {
  const documents = [
    { id: 'source', sourcePath: 'guides/start.md' },
    ...targetPaths.map((sourcePath, index) => ({ id: `target-${index}`, sourcePath })),
  ]
  const indexes = documents.map((document) => ({
    id: `${document.id}-index`,
    documentId: document.id,
    readyAt: new DateTime(new Date('2026-01-01T00:00:00.000Z')),
  }))
  const projectMembers = documents.map((document) => ({
    documentId: document.id,
    activeDocumentIndexId: `${document.id}-index`,
  }))

  return resolveRetrievalDocumentRelationTargets({
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
  const targetResolution = resolveDocumentRelationTarget(
    'wiki_link',
    ['Nest/06 - Coding Style.md', 'guides/Nest/06 - Coding Style.md'],
    'Nest/06 - Coding Style',
  )

  assert.equal(targetResolution?.resolution, 'resolved')
  assert.equal(targetResolution?.targetDocumentId, 'target-0')
  assert.equal(targetResolution?.candidateCount, 1)
  assert.equal(targetResolution?.relationType, 'wiki_link')
})

test('wiki target paths use a unique member-path suffix when the vault-root path is absent', () => {
  const targetResolution = resolveDocumentRelationTarget(
    'wiki_link',
    ['guides/Nest/06 - Coding Style.md'],
    'Nest/06 - Coding Style',
  )

  assert.equal(targetResolution?.resolution, 'resolved')
  assert.equal(targetResolution?.targetDocumentId, 'target-0')
  assert.equal(targetResolution?.candidateCount, 1)
})

test('wiki target paths remain ambiguous when multiple member paths share the suffix', () => {
  const targetResolution = resolveDocumentRelationTarget(
    'wiki_link',
    ['guides/Nest/06 - Coding Style.md', 'archive/Nest/06 - Coding Style.md'],
    'Nest/06 - Coding Style',
  )

  assert.equal(targetResolution?.resolution, 'ambiguous')
  assert.equal(targetResolution?.targetDocumentId, null)
  assert.equal(targetResolution?.candidateCount, 2)
})

test('markdown links stay relative to the source document directory', () => {
  const targetResolution = resolveDocumentRelationTarget('markdown_link', ['guides/next.md', 'next.md'], 'next.md')

  assert.equal(targetResolution?.resolution, 'resolved')
  assert.equal(targetResolution?.targetDocumentId, 'target-0')
  assert.equal(targetResolution?.candidateCount, 1)
})

test('a missing or external target is reported without trusting a persisted target hint', () => {
  assert.equal(resolveDocumentRelationTarget('markdown_link', ['guides/next.md'], 'missing.md')?.resolution, 'missing')
  assert.equal(
    resolveDocumentRelationTarget('markdown_link', ['guides/next.md'], 'https://example.com/next.md')?.targetIndexId,
    null,
  )
})

test('an unresolved heading does not expand the uniquely matched target document', () => {
  const targetResolution = resolveDocumentRelationTarget('markdown_link', ['guides/next.md'], 'next.md#missing-heading')
  assert.equal(targetResolution?.resolution, 'missing')
  assert.equal(targetResolution?.targetDocumentId, 'target-0')
  assert.equal(targetResolution?.targetIndexId, null)
})
