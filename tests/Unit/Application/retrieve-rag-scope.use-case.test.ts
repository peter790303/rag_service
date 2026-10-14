import assert from 'node:assert/strict'
import test from 'node:test'

import {
  emptySnapshot,
  retrievalStore,
  testLexicalFormatter,
  testRetrievalProfiles,
} from './retrieve-rag.use-case.fixtures.js'
import { RetrieveRagUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-rag.use-case.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'

test('retrieve rejects supplied query vectors without a matching embedding model identity', async () => {
  const snapshot = {
    ...emptySnapshot,
    memberships: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        ...testRetrievalProfiles,
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
    testLexicalFormatter,
    testRetrievalProfiles,
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
        ...testRetrievalProfiles,
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
    testLexicalFormatter,
    testRetrievalProfiles,
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
        ...testRetrievalProfiles,
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
    testLexicalFormatter,
    testRetrievalProfiles,
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
        ...testRetrievalProfiles,
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
    testLexicalFormatter,
    testRetrievalProfiles,
  )

  await assert.rejects(
    service.execute({ projectId: 'project', queryText: 'question' }),
    KnowledgeEmbeddingUnavailableException,
  )
})

test('document-scoped retrieval keeps candidates scoped while including project-required content', async () => {
  const documentRecords = [
    { id: 'first-document', sourcePath: 'first.md', sourceType: 'repository' },
    { id: 'second-document', sourcePath: 'second.md', sourceType: 'repository' },
  ]
  const snapshot = {
    knowledgeBaseId: 'kb',
    chunkCountsByIndexId: { 'first-document-index': 1, 'second-document-index': 1 },
    memberships: documentRecords.map((documentRecord) => ({
      documentId: documentRecord.id,
      activeDocumentIndexId: `${documentRecord.id}-index`,
      isEntry: false,
      alwaysIncludeFullContent: documentRecord.id === 'first-document',
    })),
    documents: documentRecords,
    chunks: documentRecords.map((documentRecord) => ({
      id: `${documentRecord.id}-chunk`,
      documentIndexId: `${documentRecord.id}-index`,
      ordinal: 0,
      headingPath: [],
      content: documentRecord.sourcePath,
      tokenCount: 1,
      embedding: [1],
      searchVector: [],
      blockStart: 1,
      blockEnd: 1,
    })),
    indexes: documentRecords.map((documentRecord) => ({
      id: `${documentRecord.id}-index`,
      documentId: documentRecord.id,
      revisionId: `${documentRecord.id}-revision`,
      ...testRetrievalProfiles,
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
    testLexicalFormatter,
    testRetrievalProfiles,
  )

  const result = (await service.execute({
    projectId: 'project',
    queryText: 'first',
    documentReference: 'SECOND.md#section-a',
  })) as {
    matches: Array<{ chunk: { documentReference: string }; isMandatoryContext: boolean }>
    fullContentDocuments: Array<{ documentReference: string; content: string }>
  }

  assert.deepEqual(
    result.matches.filter((match) => !match.isMandatoryContext).map((match) => match.chunk.documentReference),
    ['second.md'],
  )
  assert.deepEqual(
    result.fullContentDocuments.map(({ documentReference, content }) => ({ documentReference, content })),
    [{ documentReference: 'first.md', content: 'Full source content for first.md' }],
  )
})

test('includeNonEffective retrieves ready non-active indexes and marks their matches ineffective', async () => {
  const snapshot = {
    knowledgeBaseId: 'kb',
    chunkCountsByIndexId: { 'active-index': 0, 'inactive-index': 1 },
    memberships: [
      { documentId: 'doc', activeDocumentIndexId: 'active-index', isEntry: false, alwaysIncludeFullContent: false },
    ],
    documents: [{ id: 'doc', sourcePath: 'guide.md', sourceType: 'repository' }],
    chunks: [
      {
        id: 'inactive-chunk',
        documentIndexId: 'inactive-index',
        ordinal: 0,
        headingPath: ['Old'],
        content: 'question from old version',
        tokenCount: 4,
        embedding: [1],
        searchVector: [],
        blockStart: 1,
        blockEnd: 1,
      },
    ],
    indexes: ['active-index', 'inactive-index'].map((id) => ({
      id,
      documentId: 'doc',
      revisionId: `${id}-revision`,
      ...testRetrievalProfiles,
      embeddingModel: 'test',
      embeddingDimensions: 1,
      lexicalProfile: 'zh-hant-segmenter-v1',
      readyAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    revisions: ['active-index', 'inactive-index'].map((id) => ({
      id: `${id}-revision`,
      contentSha256: id,
      title: 'Guide',
      fullContent: null,
    })),
    relations: [],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1]], modelId: 'test' } as never,
    testLexicalFormatter,
    testRetrievalProfiles,
  )

  const result = await service.execute({
    projectId: 'project',
    queryText: 'question',
    includeNonEffective: true,
  })

  assert.equal(result.matches.length, 1)
  assert.equal(result.matches[0]?.chunk.activeDocumentIndexId, 'inactive-index')
  assert.equal(result.matches[0]?.chunk.isEffective, false)
})

test('required document retrieval does not append historical index chunks as mandatory context', async () => {
  const snapshot = {
    knowledgeBaseId: 'kb',
    chunkCountsByIndexId: { 'active-index': 1, 'historical-index': 1 },
    memberships: [
      {
        documentId: 'doc',
        activeDocumentIndexId: 'active-index',
        isEntry: false,
        alwaysIncludeFullContent: true,
      },
    ],
    documents: [{ id: 'doc', sourcePath: 'guide.md', sourceType: 'repository' }],
    chunks: [
      {
        id: 'active-chunk',
        documentIndexId: 'active-index',
        ordinal: 0,
        headingPath: ['Current'],
        content: 'The requested current answer',
        tokenCount: 4,
        embedding: [1],
        searchVector: [],
        blockStart: 1,
        blockEnd: 1,
      },
      {
        id: 'historical-chunk',
        documentIndexId: 'historical-index',
        ordinal: 0,
        headingPath: ['Historical'],
        content: 'Unrelated archived material',
        tokenCount: 3,
        embedding: [1],
        searchVector: [],
        blockStart: 20,
        blockEnd: 20,
      },
    ],
    indexes: ['active-index', 'historical-index'].map((id) => ({
      id,
      documentId: 'doc',
      revisionId: `${id}-revision`,
      ...testRetrievalProfiles,
      embeddingModel: 'test',
      embeddingDimensions: 1,
      lexicalProfile: 'zh-hant-segmenter-v1',
      readyAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    revisions: ['active-index', 'historical-index'].map((id) => ({
      id: `${id}-revision`,
      contentSha256: id,
      title: id,
      fullContent: `Full content for ${id}`,
    })),
    relations: [],
  }
  const service = new RetrieveRagUseCase(
    retrievalStore(snapshot) as never,
    { embed: async () => [[1]], modelId: 'test' } as never,
    testLexicalFormatter,
    testRetrievalProfiles,
  )

  const result = (await service.execute({
    projectId: 'project',
    queryText: 'requested current answer',
    documentReference: 'guide.md',
    includeNonEffective: true,
    topK: 2,
  })) as {
    matches: Array<{ chunk: { id: string }; isMandatoryContext: boolean }>
    fullContentDocuments: Array<{ content: string }>
  }

  assert.deepEqual(
    result.matches.map((match) => match.chunk.id),
    ['active-chunk', 'historical-chunk'],
  )
  assert.deepEqual(
    result.matches.map((match) => match.isMandatoryContext),
    [true, false],
  )
  assert.deepEqual(
    result.fullContentDocuments.map(({ content }) => content),
    ['Full content for active-index'],
  )
})
