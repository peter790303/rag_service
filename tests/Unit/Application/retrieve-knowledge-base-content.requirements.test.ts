import assert from 'node:assert/strict'
import test from 'node:test'

import { createRetrievalKnowledgeBaseContentInputFixture } from './retrieval-knowledge-base-content.fixture.ts'
import { RetrieveKnowledgeBaseContentUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-knowledge-base-content.use-case.ts'
import { DocumentRelation } from '../../../src/Domain/DocumentRelation/document-relation.ts'
import { RetrievalExactChunkCountMissingException } from '../../../src/Domain/KnowledgeBase/Exceptions/retrieval-exact-chunk-count-missing.exception.ts'
import { RetrievalRelationResolutionMissingException } from '../../../src/Domain/KnowledgeBase/Exceptions/retrieval-relation-resolution-missing.exception.ts'
import { RetrievalRevisionMissingException } from '../../../src/Domain/KnowledgeBase/Exceptions/retrieval-revision-missing.exception.ts'

const validateResultFacts = RetrieveKnowledgeBaseContentUseCase.prototype['ensureRetrievalResultRequirements'].bind(
  RetrieveKnowledgeBaseContentUseCase.prototype,
)

test('retrieval use case rejects a missing exact count instead of counting visible chunks', () => {
  const facts = createRetrievalKnowledgeBaseContentInputFixture()
  facts.chunkCountsByDocumentIndexId = {}
  assert.throws(() => validateResultFacts(facts), RetrievalExactChunkCountMissingException)
})

test('retrieval use case rejects a required document with missing full-content revision facts', () => {
  const facts = createRetrievalKnowledgeBaseContentInputFixture()
  facts.rankedChunks = []
  facts.snapshot.revisions = []
  assert.throws(() => validateResultFacts(facts), RetrievalRevisionMissingException)
})

test('retrieval use case rejects relation facts without a computed resolution', () => {
  const facts = createRetrievalKnowledgeBaseContentInputFixture()
  facts.snapshot.relations.push(
    new DocumentRelation({
      id: 'relation-1',
      sourceIndexId: 'index-1',
      targetDocumentId: null,
      targetReference: 'other.md',
      targetAnchor: null,
      relationType: 'markdown_link',
      evidenceBlockStart: 4,
      evidenceBlockEnd: 4,
      evidenceText: '[other](other.md)',
    }),
  )
  assert.throws(() => validateResultFacts(facts), RetrievalRelationResolutionMissingException)
})
