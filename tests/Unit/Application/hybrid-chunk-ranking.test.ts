import assert from 'node:assert/strict'
import test from 'node:test'

import { RetrieveKnowledgeBaseContentQueryHandler } from '../../../src/KnowledgeBases/Application/Queries/retrieve-knowledge-base-content.query.handler.ts'

test('retrieval fuses scoped vector and lexical ranks with deterministic ties', () => {
  const rankCandidates = RetrieveKnowledgeBaseContentQueryHandler.prototype['rankCandidates'].bind(
    RetrieveKnowledgeBaseContentQueryHandler.prototype,
  )
  const candidates = [
    { chunk: { id: 'outside', indexId: 'other-index' }, semanticRank: 1, lexicalRank: 1 },
    { chunk: { id: 'semantic', indexId: 'requested-index' }, semanticRank: 1, lexicalRank: null },
    { chunk: { id: 'lexical', indexId: 'requested-index' }, semanticRank: null, lexicalRank: 1 },
    { chunk: { id: 'consensus', indexId: 'requested-index' }, semanticRank: 2, lexicalRank: 2 },
  ]
  const rankedCandidates = rankCandidates({
    activeIndexIds: ['requested-index'],
    candidates,
    snapshotChunks: [],
    resultLimit: 3,
    chunkId: (chunk: (typeof candidates)[number]['chunk']) => chunk.id,
    documentIndexId: (chunk: (typeof candidates)[number]['chunk']) => chunk.indexId,
    semanticRank: (candidate: (typeof candidates)[number]) => candidate.semanticRank,
    lexicalRank: (candidate: (typeof candidates)[number]) => candidate.lexicalRank,
  })

  assert.deepEqual(
    rankedCandidates.fusedChunkRanking.map(({ candidate }) => candidate.id),
    ['consensus', 'semantic', 'lexical'],
  )
  assert.equal(rankedCandidates.fusedChunkRanking[0]?.score, 2 / 62)
  assert.equal(rankedCandidates.fusedChunkRanking[1]?.score, 1 / 61)
  assert.equal(rankedCandidates.fusedChunkRanking[2]?.score, 1 / 61)
})
