import assert from 'node:assert/strict'
import test from 'node:test'

import {
  emptyRetrievalSnapshotFixture,
  createRetrievalPersistenceFixture,
  retrievalProfileFixtures,
} from './retrieve-knowledge-base-content.use-case.fixtures.ts'
import type { ChunkIndexOrdinalsQueryObject } from '../../../src/Application/Chunks/QueryObjects/chunk.query-object.ts'
import { RetrieveKnowledgeBaseContentUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-knowledge-base-content.use-case.ts'
import { KnowledgeIndexPendingException } from '../../../src/Domain/DocumentIndex/Exceptions/knowledge-index-pending.exception.ts'
import { HybridKnowledgeRetrievalResource } from '../../../src/Interfaces/Http/Resources/hybrid-knowledge-retrieval.resource.ts'

test('retrieve returns the established pending-index conflict contract', async () => {
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(emptyRetrievalSnapshotFixture).dependencies,
    { embed: async () => [[1]], modelId: 'test' },
    retrievalProfileFixtures,
  )
  await assert.rejects(service.execute({ projectId: 'project', queryText: 'question' }), (error: unknown) => {
    assert.ok(error instanceof KnowledgeIndexPendingException)
    assert.deepEqual(
      { code: error.code, message: error.message },
      { code: 'REQUIRED_KNOWLEDGE_INDEX_PENDING', message: 'Knowledge index is not ready' },
    )

    return true
  })
})

test('retrieve reads project facts inside the readonly snapshot before validating pending required indexes', async () => {
  let receivedCriteria: { projectId: string } | undefined
  const persistence = createRetrievalPersistenceFixture(emptyRetrievalSnapshotFixture, (knowledgeBaseProjectQO) => {
    receivedCriteria = knowledgeBaseProjectQO
  })
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...persistence.dependencies,
    { embed: async () => [[1]], modelId: 'test' },
    retrievalProfileFixtures,
  )

  await assert.rejects(
    service.execute({ projectId: 'project', queryText: 'DEPLOYMENTS!!!' }),
    KnowledgeIndexPendingException,
  )

  assert.deepEqual(receivedCriteria, {
    projectId: 'project',
  })
  assert.deepEqual(persistence.calls, [
    'snapshot:start',
    'knowledgeBase',
    'memberships',
    'documents',
    'indexes',
    'snapshot:end',
  ])
  assert.deepEqual(persistence.ownerCalls, [
    { owner: 'memberships', input: { knowledgeBaseId: 'kb' } },
    { owner: 'documents', input: { documentIds: ['doc'] } },
    { owner: 'indexes', input: { documentIds: ['doc'] } },
    { owner: 'revisions', input: { revisionIds: [] } },
    { owner: 'relations', input: { documentIndexIds: [] } },
  ])
})

test('retrieve ranks Chinese lexical keywords and queries context only for the selected topK roots', async () => {
  const contextQueries: ChunkIndexOrdinalsQueryObject[] = []
  const snapshot = {
    knowledgeBaseId: 'kb',
    memberships: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    documents: [{ id: 'doc', sourcePath: 'guide.md', sourceType: 'repository' }],
    chunks: [
      {
        id: 'unrelated',
        documentIndexId: 'index',
        ordinal: 0,
        headingPath: [],
        content: '如何啟動服務',
        tokenCount: 3,
        embedding: [1, 0],
        searchVector: [],
        blockStart: 1,
        blockEnd: 1,
      },
      ...Array.from({ length: 9 }, (_, offset) => ({
        id: `unrelated-${offset + 1}`,
        documentIndexId: 'index',
        ordinal: offset + 1,
        headingPath: [],
        content: '其他服務說明',
        tokenCount: 3,
        embedding: [1, 0],
        searchVector: [],
        blockStart: offset + 2,
        blockEnd: offset + 2,
      })),
      {
        id: 'matching',
        documentIndexId: 'index',
        ordinal: 10,
        headingPath: [],
        content: '部署設定說明',
        tokenCount: 3,
        embedding: [1, 0],
        searchVector: [],
        blockStart: 2,
        blockEnd: 2,
      },
    ],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        ...retrievalProfileFixtures,
        embeddingModel: 'embed-v1',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    revisions: [{ id: 'revision', contentSha256: 'a'.repeat(64), title: 'Guide' }],
    relations: [],
  }
  const persistence = createRetrievalPersistenceFixture(snapshot, undefined, (chunkIndexOrdinalsQO) => {
    contextQueries.push(chunkIndexOrdinalsQO)
  })
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...persistence.dependencies,
    { embed: async () => [[1, 0]], modelId: 'embed-v1' },
    retrievalProfileFixtures,
  )

  const retrievalContentDTO = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
    await service.execute({ projectId: 'project', queryText: '部署設定', topK: 1 }),
  )

  const matching = retrievalContentDTO.matches.find((match) => match.chunk.id === 'matching')

  assert.equal(matching?.lexicalRank, 1)
  assert.equal(matching?.chunk.contentVersion, `sha256:${'a'.repeat(64)}`)
  assert.equal(matching?.chunk.totalChunks, 11)
  assert.equal(retrievalContentDTO.matches.length, 1)
  assert.deepEqual(contextQueries, [{ documentIndexId: 'index', ordinals: [9, 11] }])
  assert.deepEqual(persistence.calls, [
    'snapshot:start',
    'knowledgeBase',
    'memberships',
    'documents',
    'indexes',
    'revisions',
    'relations',
    'lexical',
    'semantic',
    'context',
    'chunks',
    'chunkReferences',
    'snapshot:end',
  ])
  assert.deepEqual(
    persistence.ownerCalls.filter(({ owner }) => owner === 'indexChunks'),
    [{ owner: 'indexChunks', input: { fullContentIndexIds: ['index'], countedIndexIds: ['index'] } }],
  )
})

test('retrieve groups neighboring ordinals per index and keeps each root context in its own document', async () => {
  const contextQueries: ChunkIndexOrdinalsQueryObject[] = []
  const snapshot = {
    knowledgeBaseId: 'kb',
    memberships: ['a', 'b'].map((suffix) => ({
      documentId: `doc-${suffix}`,
      activeDocumentIndexId: `index-${suffix}`,
    })),
    documents: ['a', 'b'].map((suffix) => ({
      id: `doc-${suffix}`,
      sourcePath: `${suffix}.md`,
      sourceType: 'repository',
    })),
    chunks: [
      { id: 'root-a', documentIndexId: 'index-a', ordinal: 1, content: 'root a' },
      { id: 'root-b', documentIndexId: 'index-b', ordinal: 3, content: 'root b' },
      { id: 'prev-a', documentIndexId: 'index-a', ordinal: 0, content: 'previous a' },
      { id: 'next-a', documentIndexId: 'index-a', ordinal: 2, content: 'next a' },
      { id: 'prev-b', documentIndexId: 'index-b', ordinal: 2, content: 'previous b' },
      { id: 'next-b', documentIndexId: 'index-b', ordinal: 4, content: 'next b' },
      { id: 'unrequested-a', documentIndexId: 'index-a', ordinal: 4, content: 'unrequested a' },
      { id: 'unrequested-b', documentIndexId: 'index-b', ordinal: 0, content: 'unrequested b' },
    ],
    indexes: ['a', 'b'].map((suffix) => ({
      id: `index-${suffix}`,
      documentId: `doc-${suffix}`,
      revisionId: `revision-${suffix}`,
      ...retrievalProfileFixtures,
      embeddingModel: 'embed-v1',
      embeddingDimensions: 2,
      readyAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    revisions: ['a', 'b'].map((suffix) => ({
      id: `revision-${suffix}`,
      contentSha256: suffix.repeat(64),
      title: suffix,
    })),
    relations: [],
  }
  const persistence = createRetrievalPersistenceFixture(snapshot, undefined, (chunkIndexOrdinalsQO) => {
    contextQueries.push(chunkIndexOrdinalsQO)
  })
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...persistence.dependencies,
    { embed: async () => [[1, 0]], modelId: 'embed-v1' },
    retrievalProfileFixtures,
  )

  const retrievalContentDTO = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
    await service.execute({ projectId: 'project', queryText: 'root', topK: 2 }),
  )

  assert.deepEqual(contextQueries, [
    { documentIndexId: 'index-a', ordinals: [0, 2] },
    { documentIndexId: 'index-b', ordinals: [2, 4] },
  ])
  assert.deepEqual(
    retrievalContentDTO.matches.map((match) => ({
      id: match.chunk.id,
      previousContent: match.neighboringContext.prevChunk?.content,
      nextContent: match.neighboringContext.nextChunk?.content,
    })),
    [
      { id: 'root-a', previousContent: 'previous a', nextContent: 'next a' },
      { id: 'root-b', previousContent: 'previous b', nextContent: 'next b' },
    ],
  )
})

test('retrieve includes required full-content documents beyond topK', async () => {
  const snapshot = {
    knowledgeBaseId: 'kb',
    memberships: [{ documentId: 'doc', activeDocumentIndexId: 'index', isEntry: true, alwaysIncludeFullContent: true }],
    documents: [{ id: 'doc', sourcePath: 'index.md', sourceType: 'obsidian' }],
    chunks: [
      {
        id: 'required-chunk',
        documentIndexId: 'index',
        ordinal: 0,
        headingPath: ['Index'],
        content: 'Navigation content',
        tokenCount: 2,
        embedding: [0, 1],
        searchVector: ['navigation', 'content'],
        blockStart: 1,
        blockEnd: 1,
      },
    ],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        ...retrievalProfileFixtures,
        embeddingModel: 'embed-v1',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    revisions: [
      {
        id: 'revision',
        contentSha256: 'a'.repeat(64),
        title: 'Index',
        fullContent: '# Index\n\nThe complete source text is retained without chunk clipping.',
      },
    ],
    relations: [],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1, 0]], modelId: 'embed-v1' },
    retrievalProfileFixtures,
  )

  const retrievalContentDTO = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
    await service.execute({
      projectId: 'project',
      queryText: 'unrelated terms',
      topK: 0,
    }),
  )

  assert.equal(retrievalContentDTO.matches.length, 1)
  assert.equal(retrievalContentDTO.matches[0]?.chunk.id, 'required-chunk')
  assert.equal(retrievalContentDTO.matches[0]?.chunk.totalChunks, 1)
  assert.equal(retrievalContentDTO.matches[0]?.isMandatoryContext, true)
  assert.deepEqual(
    retrievalContentDTO.fullContentDocuments.map(({ documentReference, projectId, content }) => ({
      documentReference,
      projectId,
      content,
    })),
    [
      {
        documentReference: 'index.md',
        projectId: 'project',
        content: '# Index\n\nThe complete source text is retained without chunk clipping.',
      },
    ],
  )
})

test('isEntry alone does not add full content or displace a ranked topK match', async () => {
  const snapshot = {
    knowledgeBaseId: 'kb',
    memberships: [
      { documentId: 'doc', activeDocumentIndexId: 'index', isEntry: true, alwaysIncludeFullContent: false },
    ],
    documents: [{ id: 'doc', sourcePath: 'index.md', sourceType: 'obsidian' }],
    chunks: [
      {
        id: 'ranked-chunk',
        documentIndexId: 'index',
        ordinal: 0,
        headingPath: ['Guide'],
        content: 'The requested answer',
        tokenCount: 3,
        embedding: [1, 0],
        searchVector: ['requested', 'answer'],
        blockStart: 1,
        blockEnd: 1,
      },
      {
        id: 'entry-chunk',
        documentIndexId: 'index',
        ordinal: 1,
        headingPath: ['Navigation'],
        content: 'Navigation only',
        tokenCount: 2,
        embedding: [0, 1],
        searchVector: ['navigation'],
        blockStart: 5,
        blockEnd: 5,
      },
    ],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        ...retrievalProfileFixtures,
        embeddingModel: 'embed-v1',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    revisions: [
      {
        id: 'revision',
        contentSha256: 'a'.repeat(64),
        title: 'Index',
        fullContent: '# Index\n\nFull source text',
      },
    ],
    relations: [],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1, 0]], modelId: 'embed-v1' },
    retrievalProfileFixtures,
  )

  const retrievalContentDTO = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
    await service.execute({
      projectId: 'project',
      queryText: 'requested answer',
      topK: 1,
    }),
  )

  assert.deepEqual(
    retrievalContentDTO.matches.map((match) => match.chunk.id),
    ['ranked-chunk'],
  )
  assert.equal(retrievalContentDTO.matches[0]?.isMandatoryContext, false)
  assert.deepEqual(retrievalContentDTO.fullContentDocuments, [])
})

test('retrieve serializes matches using the HTTP adapter contract', async () => {
  const snapshot = {
    knowledgeBaseId: 'kb',
    memberships: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    documents: [{ id: 'doc', sourcePath: 'guide.md', sourceType: 'repository' }],
    chunks: [
      {
        id: 'chunk-1',
        documentIndexId: 'index',
        ordinal: 0,
        headingPath: ['Guide'],
        content: 'Useful answer',
        tokenCount: 2,
        embedding: [1, 0],
        searchVector: ["'answer':2 'useful':1"],
        blockStart: 4,
        blockEnd: 4,
      },
    ],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        ...retrievalProfileFixtures,
        embeddingModel: 'embed-v1',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    revisions: [{ id: 'revision', contentSha256: 'a'.repeat(64), title: 'Guide title' }],
    relations: [
      {
        id: 'relation',
        sourceIndexId: 'index',
        targetDocumentId: null,
        targetReference: 'other.md',
        targetAnchor: null,
        relationType: 'markdown_link',
        evidenceBlockStart: 4,
        evidenceBlockEnd: 4,
        evidenceText: 'See other',
      },
    ],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1, 0]], modelId: 'embed-v1' },
    retrievalProfileFixtures,
  )

  const retrievalContentDTO = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
    await service.execute({ projectId: 'project', queryText: 'useful answer' }),
  )
  const match = retrievalContentDTO.matches[0]

  assert.ok(match)
  assert.deepEqual(
    Object.fromEntries(
      (
        [
          'projectId',
          'source',
          'documentTitle',
          'isEffective',
          'heading',
          'totalChunks',
          'indexedAt',
          'startBlock',
          'documentRevisionId',
          'searchVector',
        ] as const
      ).map((key) => [key, match.chunk[key]]),
    ),
    {
      projectId: 'project',
      source: 'repository',
      documentTitle: 'Guide title',
      isEffective: true,
      heading: 'Guide',
      totalChunks: 1,
      indexedAt: '2026-01-01T00:00:00.000Z',
      startBlock: 4,
      documentRevisionId: 'revision',
      searchVector: ["'answer':2 'useful':1"],
    },
  )
  assert.deepEqual(match.neighboringContext, { prevChunk: null, nextChunk: null })
  assert.deepEqual(match.relations[0], {
    relationId: 'relation',
    relationType: 'markdown_link',
    sourceIndexId: 'index',
    sourceDocumentReference: 'guide.md',
    targetDocumentReference: 'other.md',
    targetAnchor: null,
    targetDocumentId: null,
    evidenceBlockStart: 4,
    evidenceBlockEnd: 4,
    evidenceText: 'See other',
    resolution: 'missing',
    candidateCount: 0,
  })
  assert.equal(match.matchType, 'hybrid')
  assert.equal(match.semanticRank, 1)
  assert.equal(match.lexicalRank, 1)
  assert.equal(match.isMandatoryContext, false)
})
