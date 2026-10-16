import assert from 'node:assert/strict'
import test from 'node:test'

import { createRetrievalKnowledgeBaseContentInputFixture } from './retrieval-knowledge-base-content.fixture.ts'
import {
  createRetrievalChunkFixture,
  createRetrievalSnapshotFixture,
} from './retrieve-knowledge-base-content.use-case.fixtures.ts'
import { RetrievalKnowledgeBaseContentAssembler } from '../../../src/Application/KnowledgeBases/Assemblers/retrieval-knowledge-base-content.assembler.ts'

test('retrieval assembler preserves exact counts, nullable token counts and the original entities', () => {
  const facts = createRetrievalKnowledgeBaseContentInputFixture()
  const evidence = RetrievalKnowledgeBaseContentAssembler.toRetrievalEvidence(facts, [0.25], 'install')

  assert.equal(evidence.matches[0]?.chunk, facts.snapshot.chunks[0])
  assert.equal(evidence.matches[0]?.document, facts.snapshot.documents[0])
  assert.equal(evidence.matches[0]?.revision, facts.snapshot.revisions[0])
  assert.equal(evidence.matches[0]?.index, facts.snapshot.indexes[0])
  assert.equal(evidence.matches[0]?.membership, facts.snapshot.memberships[0])
  assert.equal(evidence.matches[0]?.totalChunks, 8)
  assert.equal(evidence.matches[0]?.chunk.tokenCount, null)
  assert.equal(evidence.requiredDocuments[0]?.revision.content, 'Guide content')
  assert.deepEqual(evidence.queryVector, [0.25])
  assert.deepEqual(evidence.queryText, 'install')
})

test('retrieval assembler preserves selected match order and required-document order', () => {
  const facts = createRetrievalKnowledgeBaseContentInputFixture()
  const second = createRetrievalSnapshotFixture({
    knowledgeBaseId: 'kb-1',
    memberships: [{ documentId: 'document-2', activeDocumentIndexId: 'index-2', alwaysIncludeFullContent: true }],
    documents: [{ id: 'document-2', sourcePath: 'reference.md' }],
    chunks: [{ id: 'chunk-2', documentIndexId: 'index-2', content: 'Configure the package.' }],
    indexes: [{ id: 'index-2', documentId: 'document-2', revisionId: 'revision-2' }],
    revisions: [{ id: 'revision-2', title: 'Reference', content: 'Reference content' }],
    relations: [],
  })
  facts.snapshot.memberships.push(...second.memberships)
  facts.snapshot.documents.push(...second.documents)
  facts.snapshot.chunks.push(...second.chunks)
  facts.snapshot.indexes.push(...second.indexes)
  facts.snapshot.revisions.push(...second.revisions)
  facts.chunkCountsByDocumentIndexId['index-2'] = 1
  facts.requiredMembers.unshift(second.memberships[0]!)
  facts.rankedChunks[0]!.rank = 2
  facts.rankedChunks.unshift({
    candidate: second.chunks[0]!,
    score: 0.9,
    rank: 1,
    isEffective: true,
    isMandatoryContext: true,
  })

  const evidence = RetrievalKnowledgeBaseContentAssembler.toRetrievalEvidence(facts, [], '')

  assert.deepEqual(
    evidence.matches.map(({ chunk }) => chunk.id),
    ['chunk-2', 'chunk-1'],
  )
  assert.deepEqual(
    evidence.requiredDocuments.map(({ document }) => document.sourcePath),
    ['reference.md', 'guide.md'],
  )
})

test('retrieval assembler keeps absent channels and neighbors explicitly null', () => {
  const facts = createRetrievalKnowledgeBaseContentInputFixture()
  const match = RetrievalKnowledgeBaseContentAssembler.toRetrievalEvidence(facts, [], '').matches[0]!

  assert.equal(match.previousChunk, null)
  assert.equal(match.nextChunk, null)
  assert.equal(match.semanticRank, null)
  assert.equal(match.lexicalRank, null)
  assert.equal(match.rawSemanticScore, null)
  assert.equal(match.rawLexicalScore, null)
})

test('retrieval assembler preserves zero scores, ranks and neighboring entities', () => {
  const facts = createRetrievalKnowledgeBaseContentInputFixture()
  const chunk = facts.snapshot.chunks[0]!
  const previousChunk = createRetrievalChunkFixture({
    id: 'chunk-previous',
    documentIndexId: 'index-1',
    ordinal: 1,
    headingPath: [],
    content: 'Before.',
  })
  const nextChunk = createRetrievalChunkFixture({
    id: 'chunk-next',
    documentIndexId: 'index-1',
    ordinal: 3,
    headingPath: ['Next'],
    content: 'After.',
  })
  facts.neighboringChunksById.set(chunk.id, { previousChunk, nextChunk })
  facts.vectorRanked = [{ chunk, semanticScore: 0, semanticRank: 1, lexicalScore: 0, lexicalRank: null }]
  facts.lexicalRanked = [{ chunk, semanticScore: 0, semanticRank: null, lexicalScore: 0.75, lexicalRank: 2 }]

  const match = RetrievalKnowledgeBaseContentAssembler.toRetrievalEvidence(facts, [], '').matches[0]!

  assert.equal(match.previousChunk, previousChunk)
  assert.equal(match.nextChunk, nextChunk)
  assert.equal(match.semanticRank, 1)
  assert.equal(match.rawSemanticScore, 0)
  assert.equal(match.lexicalRank, 2)
  assert.equal(match.rawLexicalScore, 0.75)
})
