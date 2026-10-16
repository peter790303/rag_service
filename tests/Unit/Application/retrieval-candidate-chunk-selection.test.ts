import assert from 'node:assert/strict'
import test from 'node:test'

import { RetrievalCandidateChunkAssembler } from '../../../src/Application/Chunks/Assemblers/retrieval-candidate-chunk.assembler.ts'
import type { ChunkRepository } from '../../../src/Application/Chunks/Contracts/chunk.repository.ts'
import type { FindLexicalChunkCandidatesUseCaseContract } from '../../../src/Application/Chunks/Contracts/find-lexical-chunk-candidates.use-case.contract.ts'
import type { FindLexicalChunkCandidatesDto } from '../../../src/Application/Chunks/DataTransferObjects/find-lexical-chunk-candidates.dto.ts'
import type { ChunkVectorSimilarityQueryObject } from '../../../src/Application/Chunks/QueryObjects/chunk.query-object.ts'
import { FindLexicalChunkCandidatesUseCase } from '../../../src/Application/Chunks/UseCases/find-lexical-chunk-candidates.use-case.ts'
import { FindRetrievalChunkCandidatesUseCase } from '../../../src/Application/Chunks/UseCases/find-retrieval-chunk-candidates.use-case.ts'
import { Chunk } from '../../../src/Domain/Chunk/chunk.ts'
import { ChunkLexicalSearchMatchMissingException } from '../../../src/Domain/Chunk/Exceptions/chunk-lexical-search-match-missing.exception.ts'

const createCandidateChunk = (id: string): Chunk =>
  new Chunk({
    id,
    documentIndexId: 'selected-index',
    ordinal: 0,
    headingPath: [],
    content: id,
    tokenCount: 1,
    embedding: [1, 0],
    searchVector: "'deployments':1",
    createdAt: new Date(0),
    blockStart: 1,
    blockEnd: 1,
  })

const createLexicalCandidateChunk = (id: string, queryText: string, score: number): Chunk => {
  const chunk = createCandidateChunk(id)
  chunk.recordLexicalSearchMatch(queryText, score)

  return chunk
}

const createSemanticCandidateChunk = (id: string, queryVector: readonly number[], distance: number): Chunk => {
  const semanticCandidateChunk = new Chunk({
    id,
    documentIndexId: 'selected-index',
    ordinal: 0,
    headingPath: [],
    content: id,
    tokenCount: 1,
    embedding: [1, 0],
    searchVector: '',
    createdAt: new Date(0),
    blockStart: 1,
    blockEnd: 1,
  })
  semanticCandidateChunk.recordVectorSearchMatch(queryVector, distance)

  return semanticCandidateChunk
}

test('candidate assembly preserves selected identities and source ranks without selecting or mutating entities', () => {
  const queryVector = [1, 0]
  const queryText = 'Deployments'
  const firstSharedSemanticChunk = createSemanticCandidateChunk('shared', queryVector, 0.1)
  const repeatedSharedSemanticChunk = createSemanticCandidateChunk('shared', queryVector, 0.8)
  const semanticOnlyChunk = createSemanticCandidateChunk('semantic-only', queryVector, 0.2)
  const firstSharedLexicalChunk = createLexicalCandidateChunk('shared', queryText, 0.6)
  const repeatedSharedLexicalChunk = createLexicalCandidateChunk('shared', queryText, 0.99)
  const lexicalOnlyChunk = createLexicalCandidateChunk('lexical-only', queryText, 0)
  const semanticCandidateChunks = Object.freeze([
    firstSharedSemanticChunk,
    repeatedSharedSemanticChunk,
    semanticOnlyChunk,
  ])
  const lexicalCandidateChunks = Object.freeze([firstSharedLexicalChunk, repeatedSharedLexicalChunk, lexicalOnlyChunk])
  // Selection and ordering have already been decided by the caller.
  const selectedCandidateChunks = Object.freeze([lexicalOnlyChunk, firstSharedSemanticChunk, semanticOnlyChunk])
  const sourceCandidateChunks = [...semanticCandidateChunks, ...lexicalCandidateChunks]
  sourceCandidateChunks.forEach((candidateChunk) => Object.freeze(candidateChunk))

  const retrievalCandidateChunkMatches = RetrievalCandidateChunkAssembler.toRetrievalCandidateChunkMatchDTOs(
    selectedCandidateChunks,
    semanticCandidateChunks,
    lexicalCandidateChunks,
  )

  assert.deepEqual(retrievalCandidateChunkMatches, [
    {
      candidateChunk: lexicalOnlyChunk,
      semanticRank: null,
      lexicalMatch: { candidateChunk: lexicalOnlyChunk, rank: 3 },
    },
    {
      candidateChunk: firstSharedSemanticChunk,
      semanticRank: 1,
      lexicalMatch: { candidateChunk: firstSharedLexicalChunk, rank: 1 },
    },
    { candidateChunk: semanticOnlyChunk, semanticRank: 3, lexicalMatch: null },
  ])
  assert.equal(retrievalCandidateChunkMatches[0]?.candidateChunk, lexicalOnlyChunk)
  assert.equal(retrievalCandidateChunkMatches[1]?.candidateChunk, firstSharedSemanticChunk)
  assert.equal(retrievalCandidateChunkMatches[1]?.lexicalMatch?.candidateChunk, firstSharedLexicalChunk)
  assert.equal(retrievalCandidateChunkMatches[2]?.candidateChunk, semanticOnlyChunk)
  assert.equal(firstSharedSemanticChunk.retrievalMatch, null)
  assert.equal(lexicalOnlyChunk.retrievalMatch, null)
  assert.equal(firstSharedLexicalChunk.requireLexicalSearchScoreFor(queryText), 0.6)
})

test('retrieval queries scoped entities in sequence and combines overlapping ranked channels in the UseCase', async () => {
  const candidateQueryCalls: {
    channel: string
    candidateQuery: ChunkVectorSimilarityQueryObject | FindLexicalChunkCandidatesDto
  }[] = []
  const chunkRepository = {
    findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc: async (
      chunkVectorSimilarityQO: ChunkVectorSimilarityQueryObject,
    ) => {
      assert.equal(candidateQueryCalls.length, 1)
      candidateQueryCalls.push({ channel: 'semantic', candidateQuery: chunkVectorSimilarityQO })

      return [
        createSemanticCandidateChunk('shared', chunkVectorSimilarityQO.queryVector, 0.1),
        createSemanticCandidateChunk('semantic-only', chunkVectorSimilarityQO.queryVector, 0.2),
      ]
    },
  }
  const lexicalCandidates: FindLexicalChunkCandidatesUseCaseContract = {
    execute: async (findLexicalChunkCandidatesDTO: FindLexicalChunkCandidatesDto) => {
      assert.equal(candidateQueryCalls.length, 0)
      candidateQueryCalls.push({ channel: 'lexical', candidateQuery: findLexicalChunkCandidatesDTO })

      return [
        createLexicalCandidateChunk('lexical-only', findLexicalChunkCandidatesDTO.queryText, 0.7),
        createLexicalCandidateChunk('shared', findLexicalChunkCandidatesDTO.queryText, 0.6),
      ]
    },
  }
  const candidates = await new FindRetrievalChunkCandidatesUseCase(
    chunkRepository as ChunkRepository,
    lexicalCandidates,
  ).execute({
    documentIndexIds: ['selected-index'],
    queryVector: [1, 0],
    queryText: 'Deployments',
    limit: 7,
  })

  assert.deepEqual(candidateQueryCalls, [
    {
      channel: 'lexical',
      candidateQuery: { documentIndexIds: ['selected-index'], queryText: 'Deployments', limit: 7 },
    },
    { channel: 'semantic', candidateQuery: { documentIndexIds: ['selected-index'], queryVector: [1, 0], limit: 7 } },
  ])
  assert.deepEqual(
    candidates.map((chunk) => ({ id: chunk.id, ...chunk.requireRetrievalMatch() })),
    [
      { id: 'shared', semanticScore: 0.9, lexicalScore: 0.6, semanticRank: 1, lexicalRank: 2 },
      { id: 'semantic-only', semanticScore: 0.8, lexicalScore: 0, semanticRank: 2, lexicalRank: null },
      { id: 'lexical-only', semanticScore: 0, lexicalScore: 0.7, semanticRank: null, lexicalRank: 1 },
    ],
  )
  assert.ok(candidates.every((chunk) => chunk instanceof Chunk))
  assert.deepEqual(
    candidates.map((chunk) => chunk.createdAt),
    [new Date(0), new Date(0), new Date(0)],
  )
})

test('retrieval keeps first entity identity, measurement, original channel rank and channel order when IDs repeat', async () => {
  const queryText = 'Deployments'
  const queryVector = [1, 0]
  const semanticShared = createSemanticCandidateChunk('shared', queryVector, 0.1)
  const semanticOnly = createSemanticCandidateChunk('semantic-only', queryVector, 0.2)
  const lexicalOnly = createLexicalCandidateChunk('lexical-only', queryText, 0)
  const chunkRepository = {
    findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc: async (
      chunkVectorSimilarityQO: ChunkVectorSimilarityQueryObject,
    ) => {
      assert.deepEqual(chunkVectorSimilarityQO.queryVector, queryVector)

      return [semanticShared, createSemanticCandidateChunk('shared', queryVector, 0.8), semanticOnly]
    },
  }
  const lexicalCandidates: FindLexicalChunkCandidatesUseCaseContract = {
    execute: async () => [
      createLexicalCandidateChunk('shared', queryText, 0.6),
      createLexicalCandidateChunk('shared', queryText, 0.99),
      lexicalOnly,
      createLexicalCandidateChunk('lexical-only', queryText, 0.8),
    ],
  }
  const candidates = await new FindRetrievalChunkCandidatesUseCase(
    chunkRepository as ChunkRepository,
    lexicalCandidates,
  ).execute({ documentIndexIds: ['selected-index'], queryVector, queryText, limit: 7 })

  assert.equal(candidates.length, 3)
  assert.equal(candidates[0], semanticShared)
  assert.equal(candidates[1], semanticOnly)
  assert.equal(candidates[2], lexicalOnly)
  assert.deepEqual(
    candidates.map((chunk) => ({ id: chunk.id, ...chunk.requireRetrievalMatch() })),
    [
      { id: 'shared', semanticScore: 0.9, lexicalScore: 0.6, semanticRank: 1, lexicalRank: 1 },
      { id: 'semantic-only', semanticScore: 0.8, lexicalScore: 0, semanticRank: 3, lexicalRank: null },
      { id: 'lexical-only', semanticScore: 0, lexicalScore: 0, semanticRank: null, lexicalRank: 3 },
    ],
  )
})

test('retrieval rejects lexical evidence measured for a different query instead of inventing a score', async () => {
  const queryVector = [1, 0]
  const chunkRepository = {
    findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc: async (
      chunkVectorSimilarityQO: ChunkVectorSimilarityQueryObject,
    ) => [createSemanticCandidateChunk('shared', chunkVectorSimilarityQO.queryVector, 0.1)],
  }
  const lexicalCandidates: FindLexicalChunkCandidatesUseCaseContract = {
    execute: async () => [createLexicalCandidateChunk('shared', 'different-query', 0.6)],
  }

  await assert.rejects(
    new FindRetrievalChunkCandidatesUseCase(chunkRepository as ChunkRepository, lexicalCandidates).execute({
      documentIndexIds: ['selected-index'],
      queryVector,
      queryText: 'Deployments',
      limit: 7,
    }),
    ChunkLexicalSearchMatchMissingException,
  )
})

test('the lexical Application boundary delegates the unmodified query and returns the repository entities', async () => {
  const queryText = '  Deployments!  '
  const candidate = createLexicalCandidateChunk('selected', queryText, 0.7)
  const input = Object.freeze({ documentIndexIds: Object.freeze(['selected-index']), queryText, limit: 7 })
  const calls: unknown[] = []
  const repository = {
    findByDocumentIndexIdsOrderByLexicalScoreDescAndIdAsc: async (query: unknown) => {
      calls.push(query)

      return [candidate]
    },
  }
  const lexicalCandidates = new FindLexicalChunkCandidatesUseCase(repository as ChunkRepository)

  const result = await lexicalCandidates.execute(input)

  assert.deepEqual(calls, [input])
  assert.equal(result[0], candidate)
  assert.equal(result[0]?.requireLexicalSearchScoreFor(queryText), 0.7)
  assert.equal(input.queryText, '  Deployments!  ')
})
