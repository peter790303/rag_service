import assert from 'node:assert/strict'
import test from 'node:test'

import { DocumentReference } from '../../../src/Documents/Domain/ValueObjects/document-reference.ts'
import {
  RetrieveKnowledgeBaseContentQueryHandler,
  RELATION_EXPANSION_CHUNK_LIMIT,
  RELATION_EXPANSION_RELATION_LIMIT,
  RELATION_TARGET_CHUNK_LIMIT,
} from '../../../src/KnowledgeBases/Application/Queries/retrieve-knowledge-base-content.query.handler.ts'

const expandRetrievalDocumentRelationContext = RetrieveKnowledgeBaseContentQueryHandler.prototype[
  'expandRelations'
].bind(RetrieveKnowledgeBaseContentQueryHandler.prototype)

test('uniquely resolved relation without an anchor expands a bounded set of target chunks', () => {
  const targetChunks = Array.from({ length: RELATION_TARGET_CHUNK_LIMIT + 3 }, (_, ordinal) => ({
    id: `target-${ordinal}`,
    documentIndexId: 'target-index',
    headingPath: [`Heading ${ordinal}`],
    blockStart: 1,
    blockEnd: 1,
  }))
  const expanded = expandRetrievalDocumentRelationContext({
    relations: [
      {
        id: 'relation',
        sourceIndexId: 'source-index',
        evidenceBlockStart: 1,
        evidenceBlockEnd: 1,
        targetReference: 'target.md',
        targetAnchor: null,
      },
    ],
    activeIndexChunks: [
      { id: 'source-chunk', documentIndexId: 'source-index', headingPath: [], blockStart: 1, blockEnd: 1 },
    ],
    resolutionById: new Map([
      [
        'relation',
        {
          targetIndexId: 'target-index',
          targetReference: new DocumentReference('target.md'),
        },
      ],
    ]),
    relationTargetChunks: targetChunks,
  })

  assert.deepEqual(expanded, targetChunks.slice(0, RELATION_TARGET_CHUNK_LIMIT))
})

test('anchored relation expansion also respects the target chunk limit', () => {
  const targetChunks = Array.from({ length: RELATION_TARGET_CHUNK_LIMIT + 3 }, (_, ordinal) => ({
    id: `target-${ordinal}`,
    documentIndexId: 'target-index',
    headingPath: ['Shared heading'],
    blockStart: 1,
    blockEnd: 1,
  }))
  const expanded = expandRetrievalDocumentRelationContext({
    relations: [
      {
        id: 'relation',
        sourceIndexId: 'source-index',
        evidenceBlockStart: 1,
        evidenceBlockEnd: 1,
        targetReference: 'target.md#Shared-heading',
        targetAnchor: null,
      },
    ],
    activeIndexChunks: [
      { id: 'source-chunk', documentIndexId: 'source-index', headingPath: [], blockStart: 1, blockEnd: 1 },
    ],
    resolutionById: new Map([
      [
        'relation',
        {
          targetIndexId: 'target-index',
          targetReference: new DocumentReference('target.md', 'Shared heading'),
        },
      ],
    ]),
    relationTargetChunks: targetChunks,
  })

  assert.deepEqual(expanded, targetChunks.slice(0, RELATION_TARGET_CHUNK_LIMIT))
})

test('many anchored relations share a global expanded-chunk and traversal limit', () => {
  const anchorCount = RELATION_EXPANSION_RELATION_LIMIT + 20
  const relations = Array.from({ length: anchorCount }, (_, ordinal) => ({
    id: `relation-${ordinal}`,
    sourceIndexId: 'source-index',
    evidenceBlockStart: 1,
    evidenceBlockEnd: 1,
    targetReference: `target.md#Heading-${ordinal}`,
    targetAnchor: null,
  }))
  const targetChunks = Array.from({ length: anchorCount }, (_, ordinal) => ({
    id: `target-${ordinal}`,
    documentIndexId: 'target-index',
    headingPath: [`Heading ${ordinal}`],
    blockStart: 1,
    blockEnd: 1,
  }))
  const expanded = expandRetrievalDocumentRelationContext({
    relations,
    activeIndexChunks: [
      { id: 'source-chunk', documentIndexId: 'source-index', headingPath: [], blockStart: 1, blockEnd: 1 },
    ],
    resolutionById: new Map(
      relations.map((relation, ordinal) => [
        relation.id,
        {
          targetIndexId: 'target-index',
          targetReference: new DocumentReference('target.md', `Heading-${ordinal}`),
        },
      ]),
    ),
    relationTargetChunks: targetChunks,
  })

  assert.equal(expanded.length, RELATION_EXPANSION_CHUNK_LIMIT)
  assert.equal(new Set(expanded.map((chunk) => chunk.id)).size, RELATION_EXPANSION_CHUNK_LIMIT)
})

test('relation evidence outside the selected root chunk cannot expand context or consume the limit', () => {
  const unrelated = Array.from({ length: RELATION_EXPANSION_RELATION_LIMIT }, (_, index) => ({
    id: `unrelated-${index}`,
    sourceIndexId: 'source-index',
    evidenceBlockStart: 20,
    evidenceBlockEnd: 30,
    targetReference: 'unrelated.md',
    targetAnchor: null,
  }))
  const related = {
    id: 'related',
    sourceIndexId: 'source-index',
    evidenceBlockStart: 3,
    evidenceBlockEnd: 4,
    targetReference: 'target.md',
    targetAnchor: null,
  }
  const targetChunk = {
    id: 'target-chunk',
    documentIndexId: 'target-index',
    headingPath: [],
    blockStart: 1,
    blockEnd: 2,
  }
  const expanded = expandRetrievalDocumentRelationContext({
    relations: [...unrelated, related],
    activeIndexChunks: [{ id: 'root', documentIndexId: 'source-index', headingPath: [], blockStart: 1, blockEnd: 3 }],
    resolutionById: new Map([
      ['related', { targetIndexId: 'target-index', targetReference: new DocumentReference('target.md') }],
    ]),
    relationTargetChunks: [targetChunk],
  })
  assert.deepEqual(expanded, [targetChunk])
})

test('cyclic relation traversal does not add the ranked root again', () => {
  const root = { id: 'root', documentIndexId: 'source-index', headingPath: [], blockStart: 1, blockEnd: 2 }
  const target = { id: 'target', documentIndexId: 'target-index', headingPath: [], blockStart: 1, blockEnd: 2 }
  const relations = [
    {
      id: 'out',
      sourceIndexId: 'source-index',
      evidenceBlockStart: 1,
      evidenceBlockEnd: 1,
      targetReference: 'target.md',
      targetAnchor: null,
    },
    {
      id: 'back',
      sourceIndexId: 'target-index',
      evidenceBlockStart: 1,
      evidenceBlockEnd: 1,
      targetReference: 'source.md',
      targetAnchor: null,
    },
  ]
  const expanded = expandRetrievalDocumentRelationContext({
    relations,
    activeIndexChunks: [root],
    relationTargetChunks: [root, target],
    resolutionById: new Map([
      ['out', { targetIndexId: 'target-index', targetReference: new DocumentReference('target.md') }],
      ['back', { targetIndexId: 'source-index', targetReference: new DocumentReference('source.md') }],
    ]),
  })
  assert.deepEqual(expanded, [target])
})

test('relation expansion preserves depth-first order and stops after the second hop', () => {
  const root = { id: 'root', documentIndexId: 'root', headingPath: [], ordinal: 0, blockStart: 1, blockEnd: 1 }
  const targets = ['first', 'second', 'third', 'sibling'].map((documentIndexId) => ({
    id: documentIndexId,
    documentIndexId,
    headingPath: [],
    ordinal: 0,
    blockStart: 1,
    blockEnd: 1,
  }))
  const relations = [
    { id: 'root-first', sourceIndexId: 'root', targetReference: 'first.md' },
    { id: 'first-second', sourceIndexId: 'first', targetReference: 'second.md' },
    { id: 'second-third', sourceIndexId: 'second', targetReference: 'third.md' },
    { id: 'root-sibling', sourceIndexId: 'root', targetReference: 'sibling.md' },
  ].map((relation) => ({ ...relation, evidenceBlockStart: 1, evidenceBlockEnd: 1, targetAnchor: null }))
  const expanded = expandRetrievalDocumentRelationContext({
    relations,
    activeIndexChunks: [root],
    relationTargetChunks: targets,
    resolutionById: new Map(
      relations.map((relation) => [
        relation.id,
        {
          targetIndexId: relation.targetReference.slice(0, -3),
          targetReference: new DocumentReference(relation.targetReference),
        },
      ]),
    ),
  })

  assert.deepEqual(
    expanded.map((target) => target.documentIndexId),
    ['first', 'second', 'sibling'],
  )
})
