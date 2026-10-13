import assert from 'node:assert/strict'
import test from 'node:test'

import { RetrieveRagUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-rag.use-case.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { KnowledgeIndexPendingException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'

type TestRetrievalChunk = {
  id: string
  content: string
  documentIndexId: string
  ordinal: number
}

const retrievalStore = <TSnapshot extends { chunks: TestRetrievalChunk[] }>(snapshot: TSnapshot) => ({
  loadHybridSnapshot: async (input: { queryText: string }) => {
    const lexicalMatches = snapshot.chunks.filter((chunk) =>
      chunk.content.toLocaleLowerCase().includes(input.queryText.toLocaleLowerCase()),
    )
    const lexicalRanks = new Map(lexicalMatches.map((chunk, index) => [chunk.id, index + 1]))
    const candidates = snapshot.chunks.map((chunk, index) => {
      const lexicalRank = lexicalRanks.get(chunk.id) ?? null

      return {
        chunk,
        semanticScore: 1 / (index + 1),
        lexicalScore: lexicalRank === null ? 0 : 1 / lexicalRank,
        semanticRank: index + 1,
        lexicalRank,
      }
    })

    return { snapshot, candidates, contextChunks: snapshot.chunks, relationTargetChunks: snapshot.chunks }
  },
})

const emptySnapshot = {
  knowledgeBaseId: 'kb',
  chunkCountsByIndexId: {},
  memberships: [{ documentId: 'doc', activeDocumentIndexId: null }],
  documents: [{ id: 'doc', sourcePath: 'guide.md' }],
  chunks: [],
  indexes: [],
  revisions: [],
  relations: [],
}

test('retrieve returns the established pending-index conflict contract', async () => {
  const service = new RetrieveRagUseCase(
    retrievalStore(emptySnapshot) as never,
    { embed: async () => [[1]], modelId: 'test' } as never,
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

test('retrieve ranks Chinese lexical keywords instead of dropping them', async () => {
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
      },
      {
        id: 'matching',
        documentIndexId: 'index',
        ordinal: 1,
        headingPath: [],
        content: '部署設定說明',
        tokenCount: 3,
        embedding: [1, 0],
        searchVector: [],
        blockStart: 2,
      },
    ],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        chunkingProfile: 'markdown-v1',
        embeddingModel: 'embed-v1',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    revisions: [{ id: 'revision', contentSha256: 'a'.repeat(64), title: 'Guide' }],
    relations: [],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1, 0]], modelId: 'embed-v1' } as never,
  )

  const result = (await service.execute({ projectId: 'project', queryText: '部署設定' })) as {
    matches: Array<{ chunk: { id: string; contentVersion: string }; lexicalRank: number | null }>
  }

  const matching = result.matches.find((match) => match.chunk.id === 'matching')

  assert.equal(matching?.lexicalRank, 1)
  assert.equal(matching?.chunk.contentVersion, `sha256:${'a'.repeat(64)}`)
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
      },
    ],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        chunkingProfile: 'markdown-v1',
        embeddingModel: 'embed-v1',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    revisions: [
      {
        id: 'revision',
        contentSha256: 'sha',
        title: 'Index',
        fullContent: '# Index\n\nThe complete source text is retained without chunk clipping.',
      },
    ],
    relations: [],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1, 0]], modelId: 'embed-v1' } as never,
  )

  const result = (await service.execute({ projectId: 'project', queryText: 'unrelated terms', topK: 0 })) as {
    matches: Array<{ chunk: { id: string }; isMandatoryContext: boolean }>
    fullContentDocuments: Array<{ documentReference: string; projectId: string; content: string }>
  }

  assert.equal(result.matches.length, 1)
  assert.equal(result.matches[0]?.chunk.id, 'required-chunk')
  assert.equal(result.matches[0]?.isMandatoryContext, true)
  assert.deepEqual(
    result.fullContentDocuments.map(({ documentReference, projectId, content }) => ({
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

test('retrieve serializes matches using the HTTP adapter contract', async () => {
  const snapshot = {
    knowledgeBaseId: 'kb',
    chunkCountsByIndexId: { index: 3 },
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
        searchVector: ['useful', 'answer'],
        blockStart: 4,
      },
    ],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        chunkingProfile: 'markdown-v1',
        embeddingModel: 'embed-v1',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    revisions: [{ id: 'revision', contentSha256: 'sha', title: 'Guide title' }],
    relations: [
      {
        id: 'relation',
        sourceIndexId: 'index',
        targetDocumentId: null,
        targetReference: 'other.md',
        targetAnchor: null,
        relationType: 'markdown-link',
        evidenceBlockStart: 4,
        evidenceBlockEnd: 4,
        evidenceText: 'See other',
      },
    ],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1, 0]], modelId: 'embed-v1' } as never,
  )

  const result = (await service.execute({ projectId: 'project', queryText: 'useful answer' })) as {
    matches: Array<{
      chunk: Record<string, unknown>
      neighboringContext: unknown
      relations: unknown[]
      [key: string]: unknown
    }>
  }
  const match = result.matches[0]

  assert.ok(match)
  assert.deepEqual(
    Object.fromEntries(
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
      ].map((key) => [key, match.chunk[key]]),
    ),
    {
      projectId: 'project',
      source: 'repository',
      documentTitle: 'Guide title',
      isEffective: true,
      heading: 'Guide',
      totalChunks: 3,
      indexedAt: '2026-01-01T00:00:00.000Z',
      startBlock: 4,
      documentRevisionId: 'revision',
      searchVector: ['useful', 'answer'],
    },
  )
  assert.deepEqual(match.neighboringContext, { prevChunk: null, nextChunk: null })
  assert.deepEqual(match.relations[0], {
    relationId: 'relation',
    relationType: 'markdown-link',
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

test('relation target is resolved from the unique ready project member even when the stored id hint is wrong', async () => {
  const snapshot = {
    ...emptySnapshot,
    memberships: [
      { documentId: 'source', activeDocumentIndexId: 'source-index', isEntry: false, alwaysIncludeFullContent: false },
      { documentId: 'target', activeDocumentIndexId: 'target-index', isEntry: false, alwaysIncludeFullContent: false },
    ],
    documents: [
      { id: 'source', sourcePath: 'guides/start.md', sourceType: 'repository' },
      { id: 'target', sourcePath: 'guides/next.md', sourceType: 'repository' },
    ],
    chunks: [
      {
        id: 'source-chunk',
        documentIndexId: 'source-index',
        ordinal: 0,
        headingPath: [],
        content: 'start',
        tokenCount: 1,
        embedding: [1],
        searchVector: [],
        blockStart: 1,
      },
      {
        id: 'target-chunk',
        documentIndexId: 'target-index',
        ordinal: 0,
        headingPath: ['Install'],
        content: 'install steps',
        tokenCount: 2,
        embedding: [1],
        searchVector: [],
        blockStart: 1,
      },
      {
        id: 'target-sibling-chunk',
        documentIndexId: 'target-index',
        ordinal: 1,
        headingPath: ['Usage'],
        content: 'unrelated usage section',
        tokenCount: 3,
        embedding: [1],
        searchVector: [],
        blockStart: 5,
      },
    ],
    indexes: [
      {
        id: 'source-index',
        documentId: 'source',
        revisionId: 'source-revision',
        chunkingProfile: 'v1',
        embeddingModel: 'test',
        embeddingDimensions: 1,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date(),
      },
      {
        id: 'target-index',
        documentId: 'target',
        revisionId: 'target-revision',
        chunkingProfile: 'v1',
        embeddingModel: 'test',
        embeddingDimensions: 1,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date(),
      },
    ],
    revisions: [
      { id: 'source-revision', contentSha256: 's', title: 'Start' },
      { id: 'target-revision', contentSha256: 't', title: 'Next' },
    ],
    relations: [
      {
        id: 'link',
        sourceIndexId: 'source-index',
        targetDocumentId: 'wrong-hint',
        targetReference: './next.md#install',
        targetAnchor: null,
        relationType: 'wiki-link',
        evidenceBlockStart: 1,
        evidenceBlockEnd: 1,
        evidenceText: 'Next',
      },
    ],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1]], modelId: 'test' } as never,
  )

  const result = (await service.execute({ projectId: 'project', queryText: 'start', topK: 1 })) as {
    matches: Array<{
      chunk: { id: string }
      relations: Array<{ targetDocumentId: string | null; resolution: string; candidateCount: number }>
    }>
  }

  assert.deepEqual(
    result.matches.map((match) => match.chunk.id),
    ['source-chunk', 'target-chunk'],
  )
  assert.deepEqual(result.matches[0]?.relations[0], {
    relationId: 'link',
    relationType: 'wiki-link',
    sourceIndexId: 'source-index',
    sourceDocumentReference: 'guides/start.md',
    targetDocumentReference: './next.md#install',
    targetAnchor: 'install',
    targetDocumentId: 'target',
    evidenceBlockStart: 1,
    evidenceBlockEnd: 1,
    evidenceText: 'Next',
    resolution: 'resolved',
    candidateCount: 1,
  })
})

test('relation with a missing anchor is reported unresolved and is not expanded', async () => {
  const snapshot = {
    ...emptySnapshot,
    memberships: [
      { documentId: 'source', activeDocumentIndexId: 'source-index', isEntry: false, alwaysIncludeFullContent: false },
      { documentId: 'target', activeDocumentIndexId: 'target-index', isEntry: false, alwaysIncludeFullContent: false },
    ],
    documents: [
      { id: 'source', sourcePath: 'guides/start.md', sourceType: 'repository' },
      { id: 'target', sourcePath: 'guides/next.md', sourceType: 'repository' },
    ],
    chunks: [
      {
        id: 'source-chunk',
        documentIndexId: 'source-index',
        ordinal: 0,
        headingPath: [],
        content: 'start',
        tokenCount: 1,
        embedding: [1],
        searchVector: [],
        blockStart: 1,
      },
      {
        id: 'target-chunk',
        documentIndexId: 'target-index',
        ordinal: 0,
        headingPath: ['Existing section'],
        content: 'target body',
        tokenCount: 2,
        embedding: [1],
        searchVector: [],
        blockStart: 1,
      },
    ],
    indexes: ['source', 'target'].map((documentId) => ({
      id: `${documentId}-index`,
      documentId,
      revisionId: `${documentId}-revision`,
      chunkingProfile: 'v1',
      embeddingModel: 'test',
      embeddingDimensions: 1,
      lexicalProfile: 'zh-hant-segmenter-v1',
      readyAt: new Date(),
    })),
    revisions: ['source', 'target'].map((id) => ({ id: `${id}-revision`, contentSha256: id, title: id })),
    relations: [
      {
        id: 'link',
        sourceIndexId: 'source-index',
        targetDocumentId: null,
        targetReference: './next.md#missing-section',
        targetAnchor: null,
        relationType: 'wiki-link',
        evidenceBlockStart: 1,
        evidenceBlockEnd: 1,
        evidenceText: 'Next section',
      },
    ],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1]], modelId: 'test' } as never,
  )

  const result = (await service.execute({ projectId: 'project', queryText: 'start', topK: 1 })) as {
    matches: Array<{
      chunk: { id: string }
      relations: Array<{
        targetDocumentId: string | null
        targetAnchor: string | null
        resolution: string
        candidateCount: number
      }>
    }>
  }

  assert.deepEqual(
    result.matches.map((match) => match.chunk.id),
    ['source-chunk'],
  )
  assert.deepEqual(result.matches[0]?.relations[0], {
    relationId: 'link',
    relationType: 'wiki-link',
    sourceIndexId: 'source-index',
    sourceDocumentReference: 'guides/start.md',
    targetDocumentReference: './next.md#missing-section',
    targetAnchor: 'missing-section',
    targetDocumentId: 'target',
    evidenceBlockStart: 1,
    evidenceBlockEnd: 1,
    evidenceText: 'Next section',
    resolution: 'missing',
    candidateCount: 1,
  })
})

test('relation target reports ambiguity and does not expand duplicate project references', async () => {
  const snapshot = {
    ...emptySnapshot,
    memberships: [
      { documentId: 'source', activeDocumentIndexId: 'source-index', isEntry: false, alwaysIncludeFullContent: false },
      {
        documentId: 'target-a',
        activeDocumentIndexId: 'target-a-index',
        isEntry: false,
        alwaysIncludeFullContent: false,
      },
      {
        documentId: 'target-b',
        activeDocumentIndexId: 'target-b-index',
        isEntry: false,
        alwaysIncludeFullContent: false,
      },
    ],
    documents: [
      { id: 'source', sourcePath: 'start.md', sourceType: 'repository' },
      { id: 'target-a', sourcePath: 'next.md', sourceType: 'repository' },
      { id: 'target-b', sourcePath: 'next.md', sourceType: 'repository' },
    ],
    chunks: ['source-index', 'target-a-index', 'target-b-index'].map((documentIndexId) => ({
      id: documentIndexId,
      documentIndexId,
      ordinal: 0,
      headingPath: [],
      content: documentIndexId,
      tokenCount: 1,
      embedding: [1],
      searchVector: [],
      blockStart: 1,
    })),
    indexes: ['source', 'target-a', 'target-b'].map((documentId) => ({
      id: documentId === 'source' ? 'source-index' : `${documentId}-index`,
      documentId,
      revisionId: `${documentId}-revision`,
      chunkingProfile: 'v1',
      embeddingModel: 'test',
      embeddingDimensions: 1,
      lexicalProfile: 'zh-hant-segmenter-v1',
      readyAt: new Date(),
    })),
    revisions: ['source', 'target-a', 'target-b'].map((id) => ({ id: `${id}-revision`, contentSha256: id, title: id })),
    relations: [
      {
        id: 'link',
        sourceIndexId: 'source-index',
        targetDocumentId: null,
        targetReference: 'next.md',
        targetAnchor: null,
        relationType: 'markdown-link',
        evidenceBlockStart: 1,
        evidenceBlockEnd: 1,
        evidenceText: 'Next',
      },
    ],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1]], modelId: 'test' } as never,
  )

  const result = (await service.execute({ projectId: 'project', queryText: 'source', topK: 1 })) as {
    matches: Array<{
      chunk: { id: string }
      relations: Array<{ targetDocumentId: string | null; resolution: string; candidateCount: number }>
    }>
  }

  assert.equal(result.matches.length, 1)
  assert.deepEqual(result.matches[0]?.relations[0], {
    relationId: 'link',
    relationType: 'markdown-link',
    sourceIndexId: 'source-index',
    sourceDocumentReference: 'start.md',
    targetDocumentReference: 'next.md',
    targetAnchor: null,
    targetDocumentId: null,
    evidenceBlockStart: 1,
    evidenceBlockEnd: 1,
    evidenceText: 'Next',
    resolution: 'ambiguous',
    candidateCount: 2,
  })
})

test('retrieve rejects active indexes created with a different embedding model', async () => {
  const snapshot = {
    ...emptySnapshot,
    memberships: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        chunkingProfile: 'markdown-v1',
        embeddingModel: 'old-embedding-model',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1, 0]], modelId: 'current-embedding-model' } as never,
  )

  await assert.rejects(
    service.execute({ projectId: 'project', queryText: 'question' }),
    KnowledgeEmbeddingUnavailableException,
  )
})

test('retrieve rejects supplied query vectors without a matching embedding model identity', async () => {
  const snapshot = {
    ...emptySnapshot,
    memberships: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        chunkingProfile: 'markdown-v1',
        embeddingModel: 'indexed-embedding-model',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1, 0]], modelId: 'current-embedding-model' } as never,
  )

  await assert.rejects(
    service.execute({ projectId: 'project', queryText: 'question', queryVector: [1, 0] }),
    KnowledgeEmbeddingUnavailableException,
  )
  await assert.rejects(
    service.execute({
      projectId: 'project',
      queryText: 'question',
      queryVector: [1, 0],
      embeddingModelId: 'different-embedding-model',
    }),
    KnowledgeEmbeddingUnavailableException,
  )
})

test('retrieve accepts a supplied vector when its model matches the active index', async () => {
  const snapshot = {
    ...emptySnapshot,
    memberships: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        chunkingProfile: 'markdown-v1',
        embeddingModel: 'indexed-embedding-model',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1, 0]], modelId: 'current-embedding-model' } as never,
  )

  await assert.doesNotReject(
    service.execute({
      projectId: 'project',
      queryText: 'question',
      queryVector: [1, 0],
      embeddingModelId: 'indexed-embedding-model',
    }),
  )
})

test('retrieve rejects active indexes created with a different lexical profile', async () => {
  const snapshot = {
    ...emptySnapshot,
    memberships: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        chunkingProfile: 'markdown-v1',
        embeddingModel: 'test',
        embeddingDimensions: 1,
        lexicalProfile: 'legacy-lexical-v0',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1]], modelId: 'test' } as never,
  )

  await assert.rejects(
    service.execute({ projectId: 'project', queryText: 'question' }),
    KnowledgeEmbeddingUnavailableException,
  )
})

test('retrieve rejects query vectors whose dimensions differ from the active index', async () => {
  const snapshot = {
    ...emptySnapshot,
    memberships: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        chunkingProfile: 'markdown-v1',
        embeddingModel: 'test',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1]], modelId: 'test' } as never,
  )

  await assert.rejects(
    service.execute({ projectId: 'project', queryText: 'question' }),
    KnowledgeEmbeddingUnavailableException,
  )
})

test('document-scoped retrieval excludes candidates and required content from other documents', async () => {
  const documentRecords = [
    { id: 'first-document', sourcePath: 'first.md', sourceType: 'repository' },
    { id: 'second-document', sourcePath: 'second.md', sourceType: 'repository' },
  ]
  const snapshot = {
    knowledgeBaseId: 'kb',
    memberships: documentRecords.map((documentRecord) => ({
      documentId: documentRecord.id,
      activeDocumentIndexId: `${documentRecord.id}-index`,
      isEntry: false,
      alwaysIncludeFullContent: true,
    })),
    documents: documentRecords,
    chunks: documentRecords.map((documentRecord, ordinal) => ({
      id: `${documentRecord.id}-chunk`,
      documentIndexId: `${documentRecord.id}-index`,
      ordinal,
      headingPath: [],
      content: documentRecord.sourcePath,
      tokenCount: 1,
      embedding: [1],
      searchVector: [],
      blockStart: 1,
    })),
    indexes: documentRecords.map((documentRecord) => ({
      id: `${documentRecord.id}-index`,
      documentId: documentRecord.id,
      revisionId: `${documentRecord.id}-revision`,
      chunkingProfile: 'markdown-v1',
      embeddingModel: 'test',
      embeddingDimensions: 1,
      lexicalProfile: 'zh-hant-segmenter-v1',
      readyAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    revisions: documentRecords.map((documentRecord) => ({
      id: `${documentRecord.id}-revision`,
      contentSha256: documentRecord.id,
      title: documentRecord.sourcePath,
      fullContent: `Full source content for ${documentRecord.sourcePath}`,
    })),
    relations: [],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1]], modelId: 'test' } as never,
  )

  const result = (await service.execute({
    projectId: 'project',
    queryText: 'first',
    documentReference: 'SECOND.md#section-a',
  })) as {
    matches: Array<{ chunk: { documentReference: string } }>
    fullContentDocuments: Array<{ documentReference: string; content: string }>
  }

  assert.deepEqual(
    result.matches.map((match) => match.chunk.documentReference),
    ['second.md'],
  )
  assert.deepEqual(
    result.fullContentDocuments.map(({ documentReference, content }) => ({ documentReference, content })),
    [{ documentReference: 'second.md', content: 'Full source content for second.md' }],
  )
})
