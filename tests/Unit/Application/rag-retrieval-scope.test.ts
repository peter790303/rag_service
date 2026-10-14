import assert from 'node:assert/strict'
import test from 'node:test'

import { testRetrievalProfiles } from './retrieve-rag.use-case.fixtures.js'
import { RetrieveRagUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-rag.use-case.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { KnowledgeIndexPendingException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import { KnowledgeRetrievalIncompleteException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-retrieval-incomplete.exception.js'

const selectRagRetrievalScope = RetrieveRagUseCase.prototype['selectScope'].bind(RetrieveRagUseCase.prototype)

const TEST_LEXICAL_PROFILE_VERSION = 'zh-hant-segmenter-v1'

test('single-document retrieval with includeNonEffective excludes ready indexes from other documents', () => {
  const result = selectRagRetrievalScope({
    queryEmbedding: [0.25, 0.75],
    queryEmbeddingModelId: 'embedding-model',
    lexicalProfileVersion: TEST_LEXICAL_PROFILE_VERSION,
    profiles: testRetrievalProfiles,
    documentReference: 'requested.md',
    includeNonEffective: true,
    knowledgeBaseId: 'knowledge-base',
    memberships: [
      { documentId: 'requested-document', activeDocumentIndexId: 'requested-active', alwaysIncludeFullContent: false },
      { documentId: 'other-document', activeDocumentIndexId: 'other-active', alwaysIncludeFullContent: false },
    ],
    documents: [
      { id: 'requested-document', sourcePath: 'requested.md' },
      { id: 'other-document', sourcePath: 'other.md' },
    ],
    indexes: [
      {
        id: 'requested-active',
        documentId: 'requested-document',
        revisionId: 'requested-revision',
        embeddingModel: 'embedding-model',
        embeddingDimensions: 2,
        ...testRetrievalProfiles,
        lexicalProfile: TEST_LEXICAL_PROFILE_VERSION,
        readyAt: new Date(),
      },
      {
        id: 'requested-non-effective',
        documentId: 'requested-document',
        revisionId: 'old-requested-revision',
        embeddingModel: 'embedding-model',
        embeddingDimensions: 2,
        ...testRetrievalProfiles,
        lexicalProfile: TEST_LEXICAL_PROFILE_VERSION,
        readyAt: new Date(),
      },
      {
        id: 'other-active',
        documentId: 'other-document',
        revisionId: 'other-revision',
        embeddingModel: 'embedding-model',
        embeddingDimensions: 2,
        ...testRetrievalProfiles,
        lexicalProfile: TEST_LEXICAL_PROFILE_VERSION,
        readyAt: new Date(),
      },
    ],
    revisions: [],
  })

  assert.deepEqual(result.retrievalIndexIds, ['requested-active', 'requested-non-effective'])
})

const scopeFacts = () => ({
  queryEmbedding: [1, 0],
  queryEmbeddingModelId: 'embedding-model',
  lexicalProfileVersion: TEST_LEXICAL_PROFILE_VERSION,
  profiles: testRetrievalProfiles,
  documentReference: 'requested.md',
  includeNonEffective: false,
  knowledgeBaseId: 'knowledge-base',
  memberships: [
    { documentId: 'requested', activeDocumentIndexId: 'requested-index', alwaysIncludeFullContent: false },
    { documentId: 'other', activeDocumentIndexId: 'other-index', alwaysIncludeFullContent: false },
  ],
  documents: [
    { id: 'requested', sourcePath: 'requested.md' },
    { id: 'other', sourcePath: 'other.md' },
  ],
  indexes: ['requested', 'other'].map((id) => ({
    id: `${id}-index`,
    documentId: id,
    revisionId: `${id}-revision`,
    embeddingModel: 'embedding-model',
    embeddingDimensions: 2,
    ...testRetrievalProfiles,
    readyAt: new Date(),
  })),
  revisions: ['requested', 'other'].map((id) => ({ id: `${id}-revision`, fullContent: `Full ${id}` })),
})

test('every selected pipeline profile is checked before querying candidates', () => {
  for (const profile of Object.keys(testRetrievalProfiles) as Array<keyof typeof testRetrievalProfiles>) {
    const facts = scopeFacts()
    facts.indexes[0]![profile] = 'incompatible'
    assert.throws(() => selectRagRetrievalScope(facts), KnowledgeEmbeddingUnavailableException, profile)
  }
})

test('graph targets are restricted to active indexes with all matching pipeline facts', () => {
  const facts = scopeFacts()
  facts.indexes[1]!.embeddingModel = 'foreign-model'
  assert.deepEqual(selectRagRetrievalScope(facts).relationTargetIndexIds, ['requested-index'])
  facts.indexes[1]!.embeddingModel = 'embedding-model'
  facts.indexes[1]!.relationProfile = 'old-relation-profile'
  assert.deepEqual(selectRagRetrievalScope(facts).relationTargetIndexIds, ['requested-index'])
})

test('a missing required full-content revision fails even outside a document reference', () => {
  const facts = scopeFacts()
  facts.memberships[1]!.alwaysIncludeFullContent = true
  facts.revisions = facts.revisions.filter((revision) => revision.id !== 'other-revision')
  assert.throws(() => selectRagRetrievalScope(facts), KnowledgeIndexPendingException)
})

test('unknown and ambiguous requested paths fail explicitly inside the project membership scope', () => {
  const facts = scopeFacts()
  facts.documentReference = 'missing.md'
  assert.throws(() => selectRagRetrievalScope(facts), KnowledgeRetrievalIncompleteException)
  facts.documentReference = 'requested.md'
  facts.documents[1]!.sourcePath = './REQUESTED.md'
  assert.throws(() => selectRagRetrievalScope(facts), KnowledgeRetrievalIncompleteException)
})

test('nonfinite query vectors fail before querying pgvector', () => {
  const facts = scopeFacts()
  facts.queryEmbedding = [NaN, 1]
  assert.throws(() => selectRagRetrievalScope(facts), KnowledgeEmbeddingUnavailableException)
})

test('an active index pointer cannot retrieve another project document', () => {
  const facts = scopeFacts()
  facts.memberships[0]!.activeDocumentIndexId = 'other-index'
  assert.throws(() => selectRagRetrievalScope(facts), KnowledgeIndexPendingException)
})
