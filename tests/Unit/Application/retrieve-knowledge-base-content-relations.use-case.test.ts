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

test('retrieve maps adjacent chunks selected by the retrieval context', async () => {
  const snapshot = {
    knowledgeBaseId: 'kb',
    knowledgeBaseDocuments: [
      { documentId: 'doc', activeDocumentIndexId: 'index', isEntry: false, alwaysIncludeFullContent: false },
      {
        documentId: 'other-doc',
        activeDocumentIndexId: 'other-index',
        isEntry: false,
        alwaysIncludeFullContent: false,
      },
    ],
    documents: [
      { id: 'doc', sourcePath: 'guide.md', sourceType: 'repository' },
      { id: 'other-doc', sourcePath: 'other.md', sourceType: 'repository' },
    ],
    chunks: [
      {
        id: 'center',
        documentIndexId: 'index',
        ordinal: 1,
        headingPath: ['Center'],
        content: 'center content',
        tokenCount: 2,
        embedding: [1, 0],
        searchVector: [],
        blockStart: 2,
        blockEnd: 2,
      },
      {
        id: 'previous',
        documentIndexId: 'index',
        ordinal: 0,
        headingPath: ['Previous'],
        content: 'previous content',
        tokenCount: 2,
        embedding: [1, 0],
        searchVector: [],
        blockStart: 1,
        blockEnd: 1,
      },
      {
        id: 'next',
        documentIndexId: 'index',
        ordinal: 2,
        headingPath: ['Next'],
        content: 'next content',
        tokenCount: 2,
        embedding: [1, 0],
        searchVector: [],
        blockStart: 3,
        blockEnd: 3,
      },
      {
        id: 'other-index-sibling',
        documentIndexId: 'other-index',
        ordinal: 0,
        headingPath: ['Other'],
        content: 'other content',
        tokenCount: 2,
        embedding: [1, 0],
        searchVector: [],
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
      {
        id: 'other-index',
        documentId: 'other-doc',
        revisionId: 'other-revision',
        ...retrievalProfileFixtures,
        embeddingModel: 'embed-v1',
        embeddingDimensions: 2,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    revisions: [
      { id: 'revision', contentSha256: 'a'.repeat(64), title: 'Guide', content: '' },
      { id: 'other-revision', contentSha256: 'b'.repeat(64), title: 'Other', content: '' },
    ],
    relations: [],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1, 0]], modelId: 'embed-v1' },
    retrievalProfileFixtures,
  )

  const retrievalContentDTO = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
    await service.execute({ projectId: 'project', queryText: 'center', topK: 1 }),
  )

  assert.equal(retrievalContentDTO.matches[0]?.chunk.id, 'center')
  assert.equal(retrievalContentDTO.matches[0]?.chunk.prevChunkReference, 'previous')
  assert.equal(retrievalContentDTO.matches[0]?.chunk.nextChunkReference, 'next')
  assert.deepEqual(retrievalContentDTO.matches[0]?.neighboringContext, {
    prevChunk: { chunkIndex: 0, heading: 'Previous', content: 'previous content', reference: 'previous' },
    nextChunk: { chunkIndex: 2, heading: 'Next', content: 'next content', reference: 'next' },
  })
})

test('relation target is resolved from the unique ready project member even when the stored id hint is wrong', async () => {
  const snapshot = {
    ...emptyRetrievalSnapshotFixture,
    knowledgeBaseDocuments: [
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
        blockEnd: 1,
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
        blockEnd: 1,
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
        blockEnd: 5,
      },
    ],
    indexes: [
      {
        id: 'source-index',
        documentId: 'source',
        revisionId: 'source-revision',
        ...retrievalProfileFixtures,
        embeddingModel: 'test',
        embeddingDimensions: 1,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date(),
      },
      {
        id: 'target-index',
        documentId: 'target',
        revisionId: 'target-revision',
        ...retrievalProfileFixtures,
        embeddingModel: 'test',
        embeddingDimensions: 1,
        lexicalProfile: 'zh-hant-segmenter-v1',
        readyAt: new Date(),
      },
    ],
    revisions: [
      { id: 'source-revision', contentSha256: 'c'.repeat(64), title: 'Start' },
      { id: 'target-revision', contentSha256: 'd'.repeat(64), title: 'Next' },
    ],
    relations: [
      {
        id: 'link',
        sourceIndexId: 'source-index',
        targetDocumentId: 'wrong-hint',
        targetReference: 'guides/next.md#install',
        targetAnchor: null,
        relationType: 'wiki_link',
        evidenceBlockStart: 1,
        evidenceBlockEnd: 1,
        evidenceText: 'Next',
      },
    ],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1]], modelId: 'test' },
    retrievalProfileFixtures,
  )

  const retrievalContentDTO = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
    await service.execute({
      projectId: 'project',
      queryText: 'start',
      topK: 1,
      documentReference: 'guides/start.md',
    }),
  )

  assert.deepEqual(
    retrievalContentDTO.matches.map((match) => match.chunk.id),
    ['source-chunk', 'target-chunk'],
  )
  assert.deepEqual(retrievalContentDTO.matches[0]?.relations[0], {
    relationId: 'link',
    relationType: 'wiki_link',
    sourceIndexId: 'source-index',
    sourceDocumentReference: 'guides/start.md',
    targetDocumentReference: 'guides/next.md#install',
    targetAnchor: 'install',
    targetDocumentId: 'target',
    evidenceBlockStart: 1,
    evidenceBlockEnd: 1,
    evidenceText: 'Next',
    resolution: 'resolved',
    candidateCount: 1,
  })
  assert.deepEqual(
    retrievalContentDTO.matches.find((match) => match.chunk.id === 'target-chunk')?.neighboringContext.nextChunk,
    {
      chunkIndex: 1,
      heading: 'Usage',
      content: 'unrelated usage section',
      reference: 'target-sibling-chunk',
    },
  )
})

test('relation with a missing anchor is reported unresolved and is not expanded', async () => {
  const snapshot = {
    ...emptyRetrievalSnapshotFixture,
    knowledgeBaseDocuments: [
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
        blockEnd: 1,
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
        blockEnd: 1,
      },
    ],
    indexes: ['source', 'target'].map((documentId) => ({
      id: `${documentId}-index`,
      documentId,
      revisionId: `${documentId}-revision`,
      ...retrievalProfileFixtures,
      embeddingModel: 'test',
      embeddingDimensions: 1,
      lexicalProfile: 'zh-hant-segmenter-v1',
      readyAt: new Date(),
    })),
    revisions: ['source', 'target'].map((id) => ({ id: `${id}-revision`, contentSha256: 'a'.repeat(64), title: id })),
    relations: [
      {
        id: 'link',
        sourceIndexId: 'source-index',
        targetDocumentId: null,
        targetReference: 'guides/next.md#missing-section',
        targetAnchor: null,
        relationType: 'wiki_link',
        evidenceBlockStart: 1,
        evidenceBlockEnd: 1,
        evidenceText: 'Next section',
      },
    ],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1]], modelId: 'test' },
    retrievalProfileFixtures,
  )

  const retrievalContentDTO = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
    await service.execute({ projectId: 'project', queryText: 'start', topK: 1 }),
  )

  assert.deepEqual(
    retrievalContentDTO.matches.map((match) => match.chunk.id),
    ['source-chunk'],
  )
  assert.deepEqual(retrievalContentDTO.matches[0]?.relations[0], {
    relationId: 'link',
    relationType: 'wiki_link',
    sourceIndexId: 'source-index',
    sourceDocumentReference: 'guides/start.md',
    targetDocumentReference: 'guides/next.md#missing-section',
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
    ...emptyRetrievalSnapshotFixture,
    knowledgeBaseDocuments: [
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
      blockEnd: 1,
    })),
    indexes: ['source', 'target-a', 'target-b'].map((documentId) => ({
      id: documentId === 'source' ? 'source-index' : `${documentId}-index`,
      documentId,
      revisionId: `${documentId}-revision`,
      ...retrievalProfileFixtures,
      embeddingModel: 'test',
      embeddingDimensions: 1,
      lexicalProfile: 'zh-hant-segmenter-v1',
      readyAt: new Date(),
    })),
    revisions: ['source', 'target-a', 'target-b'].map((id) => ({
      id: `${id}-revision`,
      contentSha256: 'a'.repeat(64),
      title: id,
    })),
    relations: [
      {
        id: 'link',
        sourceIndexId: 'source-index',
        targetDocumentId: null,
        targetReference: 'next.md',
        targetAnchor: null,
        relationType: 'markdown_link',
        evidenceBlockStart: 1,
        evidenceBlockEnd: 1,
        evidenceText: 'Next',
      },
    ],
  }
  const service = new RetrieveKnowledgeBaseContentUseCase(
    ...createRetrievalPersistenceFixture(snapshot).dependencies,
    { embed: async () => [[1]], modelId: 'test' },
    retrievalProfileFixtures,
  )

  const retrievalContentDTO = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
    await service.execute({ projectId: 'project', queryText: 'source', topK: 1 }),
  )

  assert.equal(retrievalContentDTO.matches.length, 1)
  assert.deepEqual(retrievalContentDTO.matches[0]?.relations[0], {
    relationId: 'link',
    relationType: 'markdown_link',
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
    ...emptyRetrievalSnapshotFixture,
    knowledgeBaseDocuments: [{ documentId: 'doc', activeDocumentIndexId: 'index' }],
    indexes: [
      {
        id: 'index',
        documentId: 'doc',
        revisionId: 'revision',
        ...retrievalProfileFixtures,
        embeddingModel: 'old-embedding-model',
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
    service.execute({ projectId: 'project', queryText: 'question' }),
    KnowledgeEmbeddingUnavailableException,
  )
})
