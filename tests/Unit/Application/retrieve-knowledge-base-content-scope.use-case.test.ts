import assert from 'node:assert/strict'
import test from 'node:test'

import {
  emptyRetrievalSnapshotFixture,
  createRetrievalPersistenceFixture,
  retrievalProfileFixtures,
} from './retrieve-knowledge-base-content.use-case.fixtures.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Application/KnowledgeBases/Exceptions/knowledge-embedding-unavailable.exception.ts'
import { RetrieveKnowledgeBaseContentUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-knowledge-base-content.use-case.ts'
import { HybridKnowledgeRetrievalResource } from '../../../src/Interfaces/Http/Resources/hybrid-knowledge-retrieval.resource.ts'

test('retrieve rejects supplied query vectors without a matching embedding model identity', async () => {
  const snapshot = {
    ...emptyRetrievalSnapshotFixture,
    knowledgeBaseDocuments: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        ...retrievalProfileFixtures,
        embeddingModel: 'indexed-embedding-model',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1, 0]], modelId: 'current-embedding-model' },
    retrievalProfileFixtures,
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
    ...emptyRetrievalSnapshotFixture,
    knowledgeBaseDocuments: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        ...retrievalProfileFixtures,
        embeddingModel: 'indexed-embedding-model',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1, 0]], modelId: 'current-embedding-model' },
    retrievalProfileFixtures,
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
    ...emptyRetrievalSnapshotFixture,
    knowledgeBaseDocuments: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        ...retrievalProfileFixtures,
        embeddingModel: 'test',
        embeddingDimensions: 1,
        lexicalProfile: 'legacy-lexical-v0',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1]], modelId: 'test' },
    retrievalProfileFixtures,
  )

  await assert.rejects(
    service.execute({ projectId: 'project', queryText: 'question' }),
    KnowledgeEmbeddingUnavailableException,
  )
})

test('retrieve rejects query vectors whose dimensions differ from the active index', async () => {
  const snapshot = {
    ...emptyRetrievalSnapshotFixture,
    knowledgeBaseDocuments: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        ...retrievalProfileFixtures,
        embeddingModel: 'test',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1]], modelId: 'test' },
    retrievalProfileFixtures,
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
    knowledgeBaseDocuments: documentRecords.map((documentRecord) => ({
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
      ...retrievalProfileFixtures,
      embeddingModel: 'test',
      embeddingDimensions: 1,
      lexicalProfile: 'zh-hant-segmenter-v1',
      readyAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    revisions: documentRecords.map((documentRecord) => ({
      id: `${documentRecord.id}-revision`,
      contentSha256: 'a'.repeat(64),
      title: documentRecord.sourcePath,
      fullContent: `Full source content for ${documentRecord.sourcePath}`,
    })),
    relations: [],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1]], modelId: 'test' },
    retrievalProfileFixtures,
  )

  const retrievalContentDTO = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
    await service.execute({
      projectId: 'project',
      queryText: 'first',
      documentReference: 'SECOND.md#section-a',
    }),
  )

  assert.deepEqual(
    retrievalContentDTO.matches
      .filter((match) => !match.isMandatoryContext)
      .map((match) => match.chunk.documentReference),
    ['second.md'],
  )
  assert.deepEqual(
    retrievalContentDTO.fullContentDocuments.map(({ documentReference, content }) => ({ documentReference, content })),
    [{ documentReference: 'first.md', content: 'Full source content for first.md' }],
  )
})

test('includeNonEffective retrieves ready non-active indexes and marks their matches ineffective', async () => {
  const snapshot = {
    knowledgeBaseId: 'kb',
    knowledgeBaseDocuments: [
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
      ...retrievalProfileFixtures,
      embeddingModel: 'test',
      embeddingDimensions: 1,
      lexicalProfile: 'zh-hant-segmenter-v1',
      readyAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    revisions: ['active-index', 'inactive-index'].map((id) => ({
      id: `${id}-revision`,
      contentSha256: 'a'.repeat(64),
      title: 'Guide',
      content: '',
    })),
    relations: [],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1]], modelId: 'test' },
    retrievalProfileFixtures,
  )

  const retrievalContentDTO = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
    await service.execute({
      projectId: 'project',
      queryText: 'question',
      includeNonEffective: true,
    }),
  )

  assert.equal(retrievalContentDTO.matches.length, 1)
  assert.equal(retrievalContentDTO.matches[0]?.chunk.activeDocumentIndexId, 'inactive-index')
  assert.equal(retrievalContentDTO.matches[0]?.chunk.isEffective, false)
})

test('required document retrieval does not append historical index chunks as mandatory context', async () => {
  const snapshot = {
    knowledgeBaseId: 'kb',
    knowledgeBaseDocuments: [
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
      ...retrievalProfileFixtures,
      embeddingModel: 'test',
      embeddingDimensions: 1,
      lexicalProfile: 'zh-hant-segmenter-v1',
      readyAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    revisions: ['active-index', 'historical-index'].map((id) => ({
      id: `${id}-revision`,
      contentSha256: 'a'.repeat(64),
      title: id,
      fullContent: `Full content for ${id}`,
    })),
    relations: [],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1]], modelId: 'test' },
    retrievalProfileFixtures,
  )

  const retrievalContentDTO = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
    await service.execute({
      projectId: 'project',
      queryText: 'requested current answer',
      documentReference: 'guide.md',
      includeNonEffective: true,
      topK: 2,
    }),
  )

  assert.deepEqual(
    retrievalContentDTO.matches.map((match) => match.chunk.id),
    ['active-chunk', 'historical-chunk'],
  )
  assert.deepEqual(
    retrievalContentDTO.matches.map((match) => match.isMandatoryContext),
    [true, false],
  )
  assert.deepEqual(
    retrievalContentDTO.fullContentDocuments.map(({ content }) => content),
    ['Full content for active-index'],
  )
})
