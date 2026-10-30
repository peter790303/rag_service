import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRetrievalSnapshotFixture,
  retrievalProfileFixtures,
} from './retrieve-knowledge-base-content.use-case.fixtures.ts'
import { KnowledgeIndexPendingException } from '../../../src/DocumentIndexes/Domain/Exceptions/knowledge-index-pending.exception.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/KnowledgeBases/Application/Exceptions/knowledge-embedding-unavailable.exception.ts'
import { RetrieveKnowledgeBaseContentQueryHandler } from '../../../src/KnowledgeBases/Application/Queries/retrieve-knowledge-base-content.query.handler.ts'
import { KnowledgeRetrievalIncompleteException } from '../../../src/KnowledgeBases/Domain/Exceptions/knowledge-retrieval-incomplete.exception.ts'

const selectScope = RetrieveKnowledgeBaseContentQueryHandler.prototype['selectScope'].bind(
  RetrieveKnowledgeBaseContentQueryHandler.prototype,
)
const selectKnowledgeBaseRetrievalScope = (
  facts: Omit<Parameters<typeof selectScope>[0], 'knowledgeBaseDocuments' | 'documents' | 'indexes' | 'revisions'> &
    Pick<
      Parameters<typeof createRetrievalSnapshotFixture>[0],
      'knowledgeBaseDocuments' | 'documents' | 'indexes' | 'revisions'
    >,
) => {
  const snapshot = createRetrievalSnapshotFixture({ ...facts, chunks: [], relations: [] })

  return selectScope({
    ...facts,
    knowledgeBaseDocuments: snapshot.knowledgeBaseDocuments,
    documents: snapshot.documents,
    indexes: snapshot.indexes,
    revisions: snapshot.revisions,
  })
}

const TEST_LEXICAL_PROFILE_VERSION = 'zh-hant-segmenter-v1'

test('single-document retrieval with includeNonEffective excludes ready indexes from other documents', () => {
  const retrievalScope = selectKnowledgeBaseRetrievalScope({
    queryEmbedding: [0.25, 0.75],
    queryEmbeddingModelId: 'embedding-model',
    lexicalProfileVersion: TEST_LEXICAL_PROFILE_VERSION,
    profiles: retrievalProfileFixtures,
    documentReference: 'requested.md',
    includeNonEffective: true,
    knowledgeBaseId: 'knowledge-base',
    knowledgeBaseDocuments: [
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
        ...retrievalProfileFixtures,
        lexicalProfile: TEST_LEXICAL_PROFILE_VERSION,
        readyAt: new Date(),
      },
      {
        id: 'requested-non-effective',
        documentId: 'requested-document',
        revisionId: 'old-requested-revision',
        embeddingModel: 'embedding-model',
        embeddingDimensions: 2,
        ...retrievalProfileFixtures,
        lexicalProfile: TEST_LEXICAL_PROFILE_VERSION,
        readyAt: new Date(),
      },
      {
        id: 'other-active',
        documentId: 'other-document',
        revisionId: 'other-revision',
        embeddingModel: 'embedding-model',
        embeddingDimensions: 2,
        ...retrievalProfileFixtures,
        lexicalProfile: TEST_LEXICAL_PROFILE_VERSION,
        readyAt: new Date(),
      },
    ],
    revisions: [],
  })

  assert.deepEqual(retrievalScope.retrievalIndexIds, ['requested-active', 'requested-non-effective'])
})

const createRetrievalScopeFactsFixture = () => ({
  queryEmbedding: [1, 0],
  queryEmbeddingModelId: 'embedding-model',
  lexicalProfileVersion: TEST_LEXICAL_PROFILE_VERSION,
  profiles: retrievalProfileFixtures,
  documentReference: 'requested.md',
  includeNonEffective: false,
  knowledgeBaseId: 'knowledge-base',
  knowledgeBaseDocuments: [
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
    ...retrievalProfileFixtures,
    readyAt: new Date(),
  })),
  revisions: ['requested', 'other'].map((id) => ({ id: `${id}-revision`, fullContent: `Full ${id}` })),
})

test('every selected pipeline profile is checked before querying candidates', () => {
  const testCases = Object.keys(retrievalProfileFixtures) as (keyof typeof retrievalProfileFixtures)[]
  testCases.forEach((profile) => {
    const facts = createRetrievalScopeFactsFixture()
    facts.indexes[0]![profile] = 'incompatible'
    assert.throws(() => selectKnowledgeBaseRetrievalScope(facts), KnowledgeEmbeddingUnavailableException, profile)
  })
})

test('graph targets are restricted to active indexes with all matching pipeline facts', () => {
  const facts = createRetrievalScopeFactsFixture()
  facts.indexes[1]!.embeddingModel = 'foreign-model'
  assert.deepEqual(selectKnowledgeBaseRetrievalScope(facts).relationTargetIndexIds, ['requested-index'])
  facts.indexes[1]!.embeddingModel = 'embedding-model'
  facts.indexes[1]!.relationProfile = 'old-relation-profile'
  assert.deepEqual(selectKnowledgeBaseRetrievalScope(facts).relationTargetIndexIds, ['requested-index'])
})

test('a missing required full-content revision fails even outside a document reference', () => {
  const facts = createRetrievalScopeFactsFixture()
  facts.knowledgeBaseDocuments[1]!.alwaysIncludeFullContent = true
  facts.revisions = facts.revisions.filter((revision) => revision.id !== 'other-revision')
  assert.throws(() => selectKnowledgeBaseRetrievalScope(facts), KnowledgeIndexPendingException)
})

test('unknown and ambiguous requested paths fail explicitly inside the project knowledgeBaseDocument scope', () => {
  const facts = createRetrievalScopeFactsFixture()
  facts.documentReference = 'missing.md'
  assert.throws(() => selectKnowledgeBaseRetrievalScope(facts), KnowledgeRetrievalIncompleteException)
  facts.documentReference = 'requested.md'
  facts.documents[1]!.sourcePath = './REQUESTED.md'
  assert.throws(() => selectKnowledgeBaseRetrievalScope(facts), KnowledgeRetrievalIncompleteException)
})

test('nonfinite query vectors fail before querying pgvector', () => {
  const facts = createRetrievalScopeFactsFixture()
  facts.queryEmbedding = [NaN, 1]
  assert.throws(() => selectKnowledgeBaseRetrievalScope(facts), KnowledgeEmbeddingUnavailableException)
})

test('an active index pointer cannot retrieve another project document', () => {
  const facts = createRetrievalScopeFactsFixture()
  facts.knowledgeBaseDocuments[0]!.activeDocumentIndexId = 'other-index'
  assert.throws(() => selectKnowledgeBaseRetrievalScope(facts), KnowledgeIndexPendingException)
})
