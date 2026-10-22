import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createRepositoryStub } from './document-index-lifecycle.fixture.ts'
import {
  createRetrievalSnapshotFixture,
  type RetrievalSnapshotFixture,
} from './retrieve-knowledge-base-content.use-case.fixtures.ts'
import { InvalidKnowledgeGraphQueryException } from '../../../src/Application/KnowledgeBases/Exceptions/invalid-knowledge-graph-query.exception.ts'
import { LoadKnowledgeGraphUseCase } from '../../../src/Application/KnowledgeBases/UseCases/load-knowledge-graph.use-case.ts'
import type { KnowledgeGraphState } from '../../../src/Domain/KnowledgeBase/ValueObjects/knowledge-base-graph.ts'
import { KnowledgeBaseGraph } from '../../../src/Domain/KnowledgeBase/ValueObjects/knowledge-base-graph.ts'

const graphFixture = (count = 4): RetrievalSnapshotFixture => ({
  knowledgeBaseId: 'kb',
  knowledgeBaseDocuments: Array.from({ length: count }, (_, n) => ({
    documentId: `doc-${n}`,
    activeDocumentIndexId: `index-${n}`,
  })),
  documents: Array.from({ length: count }, (_, n) => ({
    id: `doc-${n}`,
    sourcePath: `docs/${n}.md`,
    currentTitle: `Topic ${n}`,
  })),
  indexes: Array.from({ length: count }, (_, n) => ({
    id: `index-${n}`,
    documentId: `doc-${n}`,
    embeddingModel: 'existing-model',
    embeddingDimensions: 2,
  })),
  chunks: Array.from({ length: count }, (_, n) => ({
    id: `chunk-${n}`,
    documentIndexId: `index-${n}`,
    embedding: [1, 0],
    content: `Existing evidence ${n}`,
    blockStart: 2,
    blockEnd: 3,
  })),
  revisions: [],
  relations: [
    {
      id: 'reference',
      sourceIndexId: 'index-0',
      targetReference: '1.md',
      evidenceBlockStart: 0,
      evidenceBlockEnd: 1,
      evidenceText: '[Topic 1](1.md)',
    },
  ],
})

const createGraphUseCase = (input: RetrievalSnapshotFixture) => {
  const snapshot = createRetrievalSnapshotFixture(input)
  const samples: string[][] = []
  const candidateScopes: string[][] = []
  let snapshotActive = false
  type Dependencies = ConstructorParameters<typeof LoadKnowledgeGraphUseCase>
  const useCase = new LoadKnowledgeGraphUseCase(
    {
      run: async () => assert.fail('Graph must use a read-only snapshot'),
      runReadOnlySnapshot: async (operation) => {
        snapshotActive = true
        try {
          return await operation()
        } finally {
          snapshotActive = false
        }
      },
    },
    createRepositoryStub<Dependencies[1]>({
      findByProjectId: async () => {
        assert.ok(snapshotActive)

        return snapshot.knowledgeBase
      },
    }),
    { execute: async () => snapshot.knowledgeBaseDocuments },
    { execute: async () => snapshot.documents },
    { execute: async () => snapshot.indexes },
    { execute: async () => snapshot.relations },
    {
      execute: async ({ documentIndexIds }) => {
        assert.ok(snapshotActive)
        samples.push([...documentIndexIds])

        return snapshot.chunks.filter((chunk) => documentIndexIds.includes(chunk.documentIndexId) && chunk.ordinal < 3)
      },
    },
    {
      execute: async ({ documentIndexIds, limit }) => {
        assert.ok(snapshotActive)
        candidateScopes.push([...documentIndexIds])

        return snapshot.chunks.filter((chunk) => documentIndexIds.includes(chunk.documentIndexId)).slice(0, limit)
      },
    },
  )

  return { useCase, samples, candidateScopes }
}

test('overview samples only selected documents and keeps real references separate from semantic evidence', async () => {
  const { useCase, samples, candidateScopes } = createGraphUseCase(graphFixture(105))
  const knowledgeBase = await useCase.execute({ projectId: 'project', limit: 2 })
  const graph = knowledgeBase?.graph
  assert.ok(graph)
  assert.equal(graph.nodes.length, 2)
  assert.deepEqual(samples, [['index-0', 'index-1']])
  assert.deepEqual(candidateScopes, [])
  assert.equal(graph.meta.eligibleDocuments, 105)
  assert.equal(graph.meta.truncated, true)
  assert.ok(graph.meta.warnings.includes('result_limited'))
  assert.deepEqual(
    graph.edges.map((edge) => edge.kind),
    ['explicit', 'semantic'],
  )
  assert.equal(graph.edges[0]?.evidence.excerpt, '[Topic 1](1.md)')
  assert.equal(graph.edges[1]?.score, 1)
  assert.equal(graph.edges[1]?.evidence.sourceChunkId, 'chunk-0')
})

test('active ready membership, compatible model and valid vectors are required for semantic links', async () => {
  const input = graphFixture(6)
  input.knowledgeBaseDocuments[2] = { ...input.knowledgeBaseDocuments[2]!, activeDocumentIndexId: null }
  input.indexes[3]!.readyAt = null
  input.indexes[4]!.embeddingModel = 'other-model'
  input.chunks[5] = { ...input.chunks[5]!, embedding: [0, 0] }
  input.relations.push({
    id: 'external',
    sourceIndexId: 'index-0',
    targetDocumentId: 'outside-project',
    targetReference: '1.md',
  })
  const { useCase } = createGraphUseCase(input)
  const graph = (await useCase.execute({ projectId: 'project' }))?.graph
  assert.ok(graph)
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ['doc-0', 'doc-1', 'doc-4', 'doc-5'],
  )
  assert.deepEqual(graph.meta.warnings, [
    'incompatible_embedding_models',
    'index_not_ready',
    'invalid_vector',
    'missing_active_index',
  ])
  assert.equal(graph.edges.length, 2)
  assert.ok(
    graph.edges.every((edge) => ['doc-0', 'doc-1'].includes(edge.source) && ['doc-0', 'doc-1'].includes(edge.target)),
  )
  assert.equal(graph.status, 'partial')
})

test('center expansion keeps persisted candidate evidence beyond representative chunk ordinals', async () => {
  const input = graphFixture(3)
  input.chunks[1] = { ...input.chunks[1]!, embedding: [0, 1] }
  input.chunks.push({
    id: 'late-chunk',
    documentIndexId: 'index-1',
    ordinal: 8,
    embedding: [1, 0],
    content: 'Late matching evidence',
    blockStart: 15,
    blockEnd: 16,
  })
  input.indexes[2]!.embeddingModel = 'other-model'
  const { useCase, candidateScopes, samples } = createGraphUseCase(input)
  const graph = (await useCase.execute({ projectId: 'project', documentId: 'doc-0' }))?.graph
  assert.ok(graph)
  assert.deepEqual(candidateScopes, [['index-1']])
  assert.deepEqual(samples, [['index-0'], ['index-0', 'index-1']])
  const semanticEdge = graph.edges.find((edge) => edge.kind === 'semantic')
  assert.equal(semanticEdge?.evidence.targetChunkId, 'late-chunk')
  assert.equal(semanticEdge?.evidence.targetBlockStart, 15)
  assert.equal(graph.nodes[0]?.isCenter, true)
})

test('center expansion reports invalid persisted candidate vectors without inventing a neighbor', async () => {
  const input = graphFixture(2)
  input.relations = []
  input.chunks[1] = { ...input.chunks[1]!, embedding: [0, 0] }
  const { useCase } = createGraphUseCase(input)
  const graph = (await useCase.execute({ projectId: 'project', documentId: 'doc-0' }))?.graph
  assert.ok(graph)
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ['doc-0'],
  )
  assert.deepEqual(graph.edges, [])
  assert.deepEqual(graph.meta.warnings, ['invalid_vector'])
  assert.equal(graph.status, 'partial')
})

test('query and unknown center return scoped empty states without fabricating neighbors', async () => {
  const { useCase } = createGraphUseCase(graphFixture())
  const search = (await useCase.execute({ projectId: 'project', query: 'Topic 2' }))?.graph
  assert.deepEqual(
    search?.nodes.map((node) => node.id),
    ['doc-2'],
  )
  const empty = (await useCase.execute({ projectId: 'project', query: 'absent' }))?.graph
  assert.equal(empty?.status, 'empty')
  const missing = (await useCase.execute({ projectId: 'project', documentId: 'foreign' }))?.graph
  assert.equal(missing?.status, 'document_not_found')
  assert.deepEqual(missing?.nodes, [])
  assert.deepEqual(missing?.edges, [])
  assert.equal(missing?.meta.semantic.available, false)
  await assert.rejects(useCase.execute({ projectId: 'project', limit: 101 }), InvalidKnowledgeGraphQueryException)
  await assert.rejects(
    useCase.execute({ projectId: 'project', minSimilarity: NaN }),
    InvalidKnowledgeGraphQueryException,
  )
})

test('graph reports missing chunks and a bounded edge response', async () => {
  const input = graphFixture(2)
  input.chunks = []
  input.relations = Array.from({ length: 501 }, (_, n) => ({
    id: `reference-${n}`,
    sourceIndexId: 'index-0',
    targetDocumentId: 'doc-1',
  }))
  const graph = (await createGraphUseCase(input).useCase.execute({ projectId: 'project' }))?.graph
  assert.equal(graph?.edges.length, 500)
  assert.equal(graph?.meta.truncated, true)
  assert.equal(graph?.meta.semantic.available, false)
  assert.deepEqual(graph?.meta.warnings, ['edge_limit_reached', 'missing_chunks'])
})

test('graph domain projection is immutable and rejects dangling edges', async () => {
  const graph = (await createGraphUseCase(graphFixture(2)).useCase.execute({ projectId: 'project' }))?.graph
  assert.ok(graph)
  assert.equal(Object.isFrozen(graph.edges[0]?.evidence), true)
  assert.throws(
    () =>
      new KnowledgeBaseGraph({ ...graph, edges: [{ ...graph.edges[0]!, target: 'outside' }] } as KnowledgeGraphState),
  )
})
