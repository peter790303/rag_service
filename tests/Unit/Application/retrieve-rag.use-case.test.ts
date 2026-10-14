import assert from 'node:assert/strict'
import test from 'node:test'

import {
  emptySnapshot,
  retrievalStore,
  testLexicalFormatter,
  testRetrievalProfiles,
} from './retrieve-rag.use-case.fixtures.js'
import { RetrieveRagUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-rag.use-case.js'
import { KnowledgeIndexPendingException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'

test('retrieve returns the established pending-index conflict contract', async () => {
  const service = new RetrieveRagUseCase(
    retrievalStore(emptySnapshot) as never,
    { embed: async () => [[1]], modelId: 'test' } as never,
    testLexicalFormatter,
    testRetrievalProfiles,
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

test('retrieve sends normalized lexical terms before validating pending required indexes', async () => {
  let receivedCriteria: { projectId: string; includeNonEffective: boolean; lexicalTerms: readonly string[] } | undefined
  const service = new RetrieveRagUseCase(
    retrievalStore(emptySnapshot, (criteria) => {
      receivedCriteria = criteria
    }) as never,
    { embed: async () => [[1]], modelId: 'test' } as never,
    testLexicalFormatter,
    testRetrievalProfiles,
  )

  await assert.rejects(service.execute({ projectId: 'project', queryText: 'DEPLOYMENTS!!!' }))

  assert.deepEqual(receivedCriteria, {
    projectId: 'project',
    includeNonEffective: false,
    lexicalTerms: ['deployments'],
  })
})

test('retrieve ranks Chinese lexical keywords and queries context only for the selected topK roots', async () => {
  let contextCriteria: Array<{ documentIndexId: string; ordinals: readonly number[] }> | undefined
  const snapshot = {
    knowledgeBaseId: 'kb',
    chunkCountsByIndexId: { index: 11 },
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
        ...testRetrievalProfiles,
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
    retrievalStore(snapshot, undefined, (criteria) => {
      contextCriteria = criteria
    }) as never,
    { embed: async () => [[1, 0]], modelId: 'embed-v1' } as never,
    testLexicalFormatter,
    testRetrievalProfiles,
  )

  const result = (await service.execute({ projectId: 'project', queryText: '部署設定', topK: 1 })) as {
    matches: Array<{ chunk: { id: string; contentVersion: string }; lexicalRank: number | null }>
  }

  const matching = result.matches.find((match) => match.chunk.id === 'matching')

  assert.equal(matching?.lexicalRank, 1)
  assert.equal(matching?.chunk.contentVersion, `sha256:${'a'.repeat(64)}`)
  assert.equal(result.matches.length, 1)
  assert.deepEqual(contextCriteria, [{ documentIndexId: 'index', ordinals: [9, 11] }])
})

test('retrieve includes required full-content documents beyond topK', async () => {
  const snapshot = {
    knowledgeBaseId: 'kb',
    chunkCountsByIndexId: { index: 1 },
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
        ...testRetrievalProfiles,
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
    testLexicalFormatter,
    testRetrievalProfiles,
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

test('isEntry alone does not add full content or displace a ranked topK match', async () => {
  const snapshot = {
    knowledgeBaseId: 'kb',
    chunkCountsByIndexId: { index: 2 },
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
        ...testRetrievalProfiles,
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
        fullContent: '# Index\n\nFull source text',
      },
    ],
    relations: [],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1, 0]], modelId: 'embed-v1' } as never,
    testLexicalFormatter,
    testRetrievalProfiles,
  )

  const result = (await service.execute({ projectId: 'project', queryText: 'requested answer', topK: 1 })) as {
    matches: Array<{ chunk: { id: string }; isMandatoryContext: boolean }>
    fullContentDocuments: unknown[]
  }

  assert.deepEqual(
    result.matches.map((match) => match.chunk.id),
    ['ranked-chunk'],
  )
  assert.equal(result.matches[0]?.isMandatoryContext, false)
  assert.deepEqual(result.fullContentDocuments, [])
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
        blockEnd: 4,
      },
    ],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        ...testRetrievalProfiles,
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
        relationType: 'markdown_link',
        evidenceBlockStart: 4,
        evidenceBlockEnd: 4,
        evidenceText: 'See other',
      },
    ],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1, 0]], modelId: 'embed-v1' } as never,
    testLexicalFormatter,
    testRetrievalProfiles,
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
