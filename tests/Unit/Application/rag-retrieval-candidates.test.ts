import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  RagChunkLexicalQuery,
  RagChunkSemanticQuery,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-chunk-repository.port.js'
import type { RetrievalChunk } from '../../../src/Application/KnowledgeBases/Contracts/rag-retrieval-store.js'
import { RetrieveRagUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-rag.use-case.js'

const loadCandidates = RetrieveRagUseCase.prototype['loadCandidates'].bind(RetrieveRagUseCase.prototype)
const chunk = (id: string): RetrievalChunk => ({
  id,
  documentIndexId: 'selected-index',
  ordinal: 0,
  headingPath: [],
  content: id,
  tokenCount: 1,
  embedding: [1, 0],
  searchVector: [],
  blockStart: 1,
  blockEnd: 1,
})

test('retrieval queries scoped facts in sequence and combines overlapping ranked channels in the UseCase', async () => {
  const calls: Array<{ channel: string; query: RagChunkSemanticQuery | RagChunkLexicalQuery }> = []
  const candidates = await loadCandidates(
    {
      findSemanticCandidates: async (query) => {
        calls.push({ channel: 'semantic', query })

        return {
          chunks: [chunk('shared'), chunk('semantic-only')],
          scores: [
            { chunkId: 'shared', score: 0.9 },
            { chunkId: 'semantic-only', score: 0.8 },
          ],
        }
      },
      findLexicalCandidates: async (query) => {
        assert.equal(calls.length, 1)
        calls.push({ channel: 'lexical', query })

        return {
          chunks: [chunk('lexical-only'), chunk('shared')],
          scores: [
            { chunkId: 'lexical-only', score: 0.7 },
            { chunkId: 'shared', score: 0.6 },
          ],
        }
      },
    },
    ['selected-index'],
    [1, 0],
    ['deployments'],
    7,
  )

  assert.deepEqual(calls, [
    { channel: 'semantic', query: { documentIndexIds: ['selected-index'], queryVector: [1, 0], limit: 7 } },
    { channel: 'lexical', query: { documentIndexIds: ['selected-index'], terms: ['deployments'], limit: 7 } },
  ])
  assert.deepEqual(
    candidates.map(({ chunk: candidate, semanticScore, lexicalScore, semanticRank, lexicalRank }) => ({
      id: candidate.id,
      semanticScore,
      lexicalScore,
      semanticRank,
      lexicalRank,
    })),
    [
      { id: 'shared', semanticScore: 0.9, lexicalScore: 0.6, semanticRank: 1, lexicalRank: 2 },
      { id: 'semantic-only', semanticScore: 0.8, lexicalScore: 0, semanticRank: 2, lexicalRank: null },
      { id: 'lexical-only', semanticScore: 0, lexicalScore: 0.7, semanticRank: null, lexicalRank: 1 },
    ],
  )
})
