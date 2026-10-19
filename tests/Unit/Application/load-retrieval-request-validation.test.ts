import assert from 'node:assert/strict'
import test from 'node:test'

import { createRepositoryStub } from './document-index-lifecycle.fixture.ts'
import type { ChunkRepository } from '../../../src/Application/Chunks/Contracts/chunk.repository.ts'
import { InvalidRetrievalChunkContextInputException } from '../../../src/Application/Chunks/Exceptions/invalid-retrieval-chunk-context-input.exception.ts'
import { InvalidRetrievalIndexChunksInputException } from '../../../src/Application/Chunks/Exceptions/invalid-retrieval-index-chunks-input.exception.ts'
import { LoadRetrievalChunkContextUseCase } from '../../../src/Application/Chunks/UseCases/load-retrieval-chunk-context.use-case.ts'
import { LoadRetrievalIndexChunksUseCase } from '../../../src/Application/Chunks/UseCases/load-retrieval-index-chunks.use-case.ts'
import type { DocumentIndexRepository } from '../../../src/Application/DocumentIndexes/Contracts/document-index.repository.ts'
import { InvalidRetrievalDocumentIndexesInputException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-retrieval-document-indexes-input.exception.ts'
import { LoadRetrievalDocumentIndexesUseCase } from '../../../src/Application/DocumentIndexes/UseCases/load-retrieval-document-indexes.use-case.ts'
import type { DocumentRevisionRepository } from '../../../src/Application/DocumentRevisions/Contracts/document-revision.repository.ts'
import { InvalidRetrievalDocumentRevisionsInputException } from '../../../src/Application/DocumentRevisions/Exceptions/invalid-retrieval-document-revisions-input.exception.ts'
import { LoadRetrievalDocumentRevisionsUseCase } from '../../../src/Application/DocumentRevisions/UseCases/load-retrieval-document-revisions.use-case.ts'
import type { DocumentRepository } from '../../../src/Application/Documents/Contracts/document.repository.ts'
import { InvalidRetrievalDocumentsInputException } from '../../../src/Application/Documents/Exceptions/invalid-retrieval-documents-input.exception.ts'
import { LoadRetrievalDocumentsUseCase } from '../../../src/Application/Documents/UseCases/load-retrieval-documents.use-case.ts'

test('retrieval use cases reject malformed DTOs before accessing repositories', async () => {
  let documentRepositoryAccesses = 0
  const documents = new LoadRetrievalDocumentsUseCase(
    createRepositoryStub<DocumentRepository>({
      findByDocumentIds: async () => {
        documentRepositoryAccesses += 1

        return []
      },
    }),
  )
  let documentIndexRepositoryAccesses = 0
  const documentIndexes = new LoadRetrievalDocumentIndexesUseCase(
    createRepositoryStub<DocumentIndexRepository>({
      findByDocumentIdsOrderByCreatedAtAscAndIdAsc: async () => {
        documentIndexRepositoryAccesses += 1

        return []
      },
    }),
  )
  let documentRevisionRepositoryAccesses = 0
  const documentRevisions = new LoadRetrievalDocumentRevisionsUseCase(
    createRepositoryStub<DocumentRevisionRepository>({
      findByDocumentRevisionIds: async () => {
        documentRevisionRepositoryAccesses += 1

        return []
      },
    }),
  )
  let chunkRepositoryAccesses = 0
  const chunks = new LoadRetrievalIndexChunksUseCase(
    createRepositoryStub<ChunkRepository>({
      findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc: async () => {
        chunkRepositoryAccesses += 1

        return []
      },
      findByDocumentIndexIds: async () => {
        chunkRepositoryAccesses += 1

        return []
      },
    }),
  )
  let chunkContextRepositoryAccesses = 0
  const chunkContext = new LoadRetrievalChunkContextUseCase(
    createRepositoryStub<ChunkRepository>({
      findByDocumentIndexIdAndOrdinals: async () => {
        chunkContextRepositoryAccesses += 1

        return []
      },
    }),
  )
  const malformedDocumentRequests: unknown[] = [
    null,
    undefined,
    [],
    {},
    { documentIds: null },
    { documentIds: 'document' },
    { documentIds: [null] },
    { documentIds: [1] },
    { documentIds: [''] },
    { documentIds: [' \t'] },
    { documentIds: new Array(1) },
  ]
  const malformedDocumentIndexRequests: unknown[] = [
    null,
    undefined,
    [],
    {},
    { documentIds: null },
    { documentIds: 'document' },
    { documentIds: [null] },
    { documentIds: [1] },
    { documentIds: [''] },
    { documentIds: [' \t'] },
    { documentIds: new Array(1) },
  ]
  const malformedDocumentRevisionRequests: unknown[] = [
    null,
    undefined,
    [],
    {},
    { revisionIds: null },
    { revisionIds: 'revision' },
    { revisionIds: [null] },
    { revisionIds: [1] },
    { revisionIds: [''] },
    { revisionIds: [' \t'] },
    { revisionIds: new Array(1) },
  ]
  const malformedChunkRequests: unknown[] = [
    null,
    undefined,
    [],
    {},
    { fullContentIndexIds: null, countedIndexIds: [] },
    { fullContentIndexIds: 'index', countedIndexIds: [] },
    { fullContentIndexIds: [null], countedIndexIds: [] },
    { fullContentIndexIds: [1], countedIndexIds: [] },
    { fullContentIndexIds: [''], countedIndexIds: [] },
    { fullContentIndexIds: [' \t'], countedIndexIds: [] },
    { fullContentIndexIds: new Array(1), countedIndexIds: [] },
    { fullContentIndexIds: [], countedIndexIds: null },
    { fullContentIndexIds: [], countedIndexIds: 'index' },
    { fullContentIndexIds: [], countedIndexIds: [null] },
    { fullContentIndexIds: [], countedIndexIds: [1] },
    { fullContentIndexIds: [], countedIndexIds: [''] },
    { fullContentIndexIds: [], countedIndexIds: [' \t'] },
    { fullContentIndexIds: [], countedIndexIds: new Array(1) },
  ]
  const malformedChunkContextRequests: unknown[] = [
    null,
    undefined,
    [],
    {},
    { candidates: null, rootChunkIds: [], activeDocumentIndexIds: [] },
    { candidates: 'chunk', rootChunkIds: [], activeDocumentIndexIds: [] },
    { candidates: [null], rootChunkIds: [], activeDocumentIndexIds: [] },
    { candidates: [{}], rootChunkIds: [], activeDocumentIndexIds: [] },
    { candidates: [{ id: '', documentIndexId: 'index', ordinal: 0 }], rootChunkIds: [], activeDocumentIndexIds: [] },
    { candidates: [{ id: 'root', documentIndexId: ' ', ordinal: 0 }], rootChunkIds: [], activeDocumentIndexIds: [] },
    {
      candidates: [{ id: 'root', documentIndexId: 'index', ordinal: -1 }],
      rootChunkIds: [],
      activeDocumentIndexIds: [],
    },
    {
      candidates: [{ id: 'root', documentIndexId: 'index', ordinal: 0.5 }],
      rootChunkIds: [],
      activeDocumentIndexIds: [],
    },
    { candidates: new Array(1), rootChunkIds: [], activeDocumentIndexIds: [] },
    { candidates: [], rootChunkIds: null, activeDocumentIndexIds: [] },
    { candidates: [], rootChunkIds: 'root', activeDocumentIndexIds: [] },
    { candidates: [], rootChunkIds: [''], activeDocumentIndexIds: [] },
    { candidates: [], rootChunkIds: [1], activeDocumentIndexIds: [] },
    { candidates: [], rootChunkIds: new Array(1), activeDocumentIndexIds: [] },
    { candidates: [], rootChunkIds: [], activeDocumentIndexIds: null },
    { candidates: [], rootChunkIds: [], activeDocumentIndexIds: [' \t'] },
    { candidates: [], rootChunkIds: [], activeDocumentIndexIds: [null] },
  ]

  await Promise.all(
    malformedDocumentRequests.map((input) =>
      assert.rejects(documents.execute(input as never), InvalidRetrievalDocumentsInputException),
    ),
  )
  await Promise.all(
    malformedDocumentIndexRequests.map((input) =>
      assert.rejects(documentIndexes.execute(input as never), InvalidRetrievalDocumentIndexesInputException),
    ),
  )
  await Promise.all(
    malformedDocumentRevisionRequests.map((input) =>
      assert.rejects(documentRevisions.execute(input as never), InvalidRetrievalDocumentRevisionsInputException),
    ),
  )
  await Promise.all(
    malformedChunkRequests.map((input) =>
      assert.rejects(chunks.execute(input as never), InvalidRetrievalIndexChunksInputException),
    ),
  )
  await Promise.all(
    malformedChunkContextRequests.map((input) =>
      assert.rejects(chunkContext.execute(input as never), InvalidRetrievalChunkContextInputException),
    ),
  )

  assert.equal(documentRepositoryAccesses, 0)
  assert.equal(documentIndexRepositoryAccesses, 0)
  assert.equal(documentRevisionRepositoryAccesses, 0)
  assert.equal(chunkRepositoryAccesses, 0)
  assert.equal(chunkContextRepositoryAccesses, 0)
})

test('valid empty retrieval scopes remain empty and preserve chunk repository calls', async () => {
  let documentRepositoryAccesses = 0
  let documentIndexRepositoryAccesses = 0
  let documentRevisionRepositoryAccesses = 0
  const documents = new LoadRetrievalDocumentsUseCase(
    createRepositoryStub<DocumentRepository>({
      findByDocumentIds: async () => {
        documentRepositoryAccesses += 1

        return []
      },
    }),
  )
  const documentIndexes = new LoadRetrievalDocumentIndexesUseCase(
    createRepositoryStub<DocumentIndexRepository>({
      findByDocumentIdsOrderByCreatedAtAscAndIdAsc: async () => {
        documentIndexRepositoryAccesses += 1

        return []
      },
    }),
  )
  const documentRevisions = new LoadRetrievalDocumentRevisionsUseCase(
    createRepositoryStub<DocumentRevisionRepository>({
      findByDocumentRevisionIds: async () => {
        documentRevisionRepositoryAccesses += 1

        return []
      },
    }),
  )
  const fullContentQueriesQO: unknown[] = []
  const countedQueriesQO: unknown[] = []
  const chunks = new LoadRetrievalIndexChunksUseCase(
    createRepositoryStub<ChunkRepository>({
      findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc: async (chunkIndexIdsQO) => {
        fullContentQueriesQO.push(chunkIndexIdsQO)

        return []
      },
      findByDocumentIndexIds: async (chunkIndexIdsQO) => {
        countedQueriesQO.push(chunkIndexIdsQO)

        return []
      },
    }),
  )

  assert.deepEqual(await documents.execute({ documentIds: [] }), [])
  assert.deepEqual(await documentIndexes.execute({ documentIds: [] }), [])
  assert.deepEqual(await documentRevisions.execute({ revisionIds: [] }), [])
  assert.deepEqual(await chunks.execute({ fullContentIndexIds: [], countedIndexIds: [] }), [])
  assert.equal(documentRepositoryAccesses, 0)
  assert.equal(documentIndexRepositoryAccesses, 0)
  assert.equal(documentRevisionRepositoryAccesses, 0)
  assert.deepEqual(fullContentQueriesQO, [{ documentIndexIds: [] }])
  assert.deepEqual(countedQueriesQO, [{ documentIndexIds: [] }])
})

test('retrieval scope deduplication preserves first-occurrence order', async () => {
  const documentQueriesQO: unknown[] = []
  const documentIndexQueriesQO: unknown[] = []
  const documentRevisionQueriesQO: unknown[] = []
  const fullContentQueriesQO: unknown[] = []
  const countedQueriesQO: unknown[] = []
  const documents = new LoadRetrievalDocumentsUseCase(
    createRepositoryStub<DocumentRepository>({
      findByDocumentIds: async (queryObject) => {
        documentQueriesQO.push(queryObject)

        return []
      },
    }),
  )
  const documentIndexes = new LoadRetrievalDocumentIndexesUseCase(
    createRepositoryStub<DocumentIndexRepository>({
      findByDocumentIdsOrderByCreatedAtAscAndIdAsc: async (queryObject) => {
        documentIndexQueriesQO.push(queryObject)

        return []
      },
    }),
  )
  const documentRevisions = new LoadRetrievalDocumentRevisionsUseCase(
    createRepositoryStub<DocumentRevisionRepository>({
      findByDocumentRevisionIds: async (queryObject) => {
        documentRevisionQueriesQO.push(queryObject)

        return []
      },
    }),
  )
  const chunks = new LoadRetrievalIndexChunksUseCase(
    createRepositoryStub<ChunkRepository>({
      findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc: async (queryObject) => {
        fullContentQueriesQO.push(queryObject)

        return []
      },
      findByDocumentIndexIds: async (queryObject) => {
        countedQueriesQO.push(queryObject)

        return []
      },
    }),
  )

  await documents.execute({ documentIds: ['document-b', 'document-a', 'document-b'] })
  await documentIndexes.execute({ documentIds: ['document-b', 'document-a', 'document-b'] })
  await documentRevisions.execute({ revisionIds: ['revision-b', 'revision-a', 'revision-b'] })
  await chunks.execute({
    fullContentIndexIds: ['full-b', 'full-a', 'full-b'],
    countedIndexIds: ['count-b', 'full-a', 'count-a', 'count-b'],
  })

  assert.deepEqual(documentQueriesQO, [{ ids: ['document-b', 'document-a'] }])
  assert.deepEqual(documentIndexQueriesQO, [{ documentIds: ['document-b', 'document-a'] }])
  assert.deepEqual(documentRevisionQueriesQO, [{ ids: ['revision-b', 'revision-a'] }])
  assert.deepEqual(fullContentQueriesQO, [{ documentIndexIds: ['full-b', 'full-a'] }])
  assert.deepEqual(countedQueriesQO, [{ documentIndexIds: ['count-b', 'count-a'] }])
})
