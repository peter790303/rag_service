import assert from 'node:assert/strict'
import test from 'node:test'

import type { RagIndexChunkReplacementOperations } from '../../../src/Application/KnowledgeBases/Contracts/rag-index-chunk-replacement-store.js'
import type { ClaimedRagIndexJob } from '../../../src/Application/KnowledgeBases/DataTransferObjects/rag-index-job.dto.js'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/KnowledgeBases/UseCases/replace-index-chunk.use-case.js'
import { RAG_DOCUMENT_INDEX_STATUS } from '../../../src/Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagExecutionStageEnum } from '../../../src/Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { InvalidRagJobLeaseException } from '../../../src/Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { KnowledgeIndexPendingException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import type { MarkdownPlan } from '../../../src/Domain/Knowledge/markdown-chunk.factory.js'
import { RagDocumentIndex } from '../../../src/Domain/Knowledge/rag-document-index.js'

const job: ClaimedRagIndexJob = {
  id: 'job-1',
  knowledgeBaseId: 'kb-1',
  documentId: 'doc-1',
  documentIndexId: 'index-1',
  generation: '1',
  attempts: 1,
  leaseToken: 'lease-1',
  leaseExpiresAt: new Date('2026-10-14T00:00:00.000Z'),
  executionVerification: {
    stage: RagExecutionStageEnum.CLAIMED,
    completedUnits: 0,
    totalUnits: null,
    verifiedAt: null,
  },
}

const plan: MarkdownPlan = {
  chunks: [
    {
      content: '# Heading\nBody',
      headingPath: ['Heading'],
      blockStart: 0,
      blockEnd: 2,
      tokenCount: 4,
    },
  ],
  relations: [
    {
      targetReference: 'Other.md',
      targetAnchor: null,
      relationType: 'wiki_link',
      evidenceBlockStart: 1,
      evidenceBlockEnd: 2,
      evidenceText: '[[Other.md]]',
    },
  ],
}

const createUseCase = (index: RagDocumentIndex | null, requestedGeneration = 1) => {
  const leaseCheckNotBefore = Date.now()
  const events: string[] = []
  const savedChunks: unknown[] = []
  const savedRelations: unknown[] = []
  let transactionCount = 0
  const operations: RagIndexChunkReplacementOperations = {
    lockDocument: async () => {
      events.push('lock-document')

      return true
    },
    lockMembership: async () => {
      events.push('lock-membership')

      return { requestedGeneration }
    },
    lockClaimedJob: async (lockedJob, now) => {
      events.push('lock-job')
      assert.equal(lockedJob, job)
      assert.ok(now.getTime() >= leaseCheckNotBefore)
      assert.ok(now.getTime() <= Date.now())
    },
    lockDocumentIndex: async (id) => {
      events.push('lock-index')
      assert.equal(id, job.documentIndexId)

      return index
    },
    deleteChunksForIndex: async (id) => {
      events.push('delete-chunks')
      assert.equal(id, job.documentIndexId)
    },
    deleteRelationsForIndex: async (id) => {
      events.push('delete-relations')
      assert.equal(id, job.documentIndexId)
    },
    saveChunks: async (rows) => {
      events.push('save-chunks')
      savedChunks.push(...rows)
    },
    saveRelations: async (id, rows) => {
      events.push('save-relations')
      assert.equal(id, job.documentIndexId)
      savedRelations.push(...rows)
    },
  }
  const store = {
    withReplacementTransaction: async <T>(operation: (tx: RagIndexChunkReplacementOperations) => Promise<T>) => {
      transactionCount += 1

      return operation(operations)
    },
  }

  return {
    useCase: new ReplaceIndexChunkUseCase(store),
    events,
    savedChunks,
    savedRelations,
    get transactionCount() {
      return transactionCount
    },
  }
}

const buildingIndex = () =>
  new RagDocumentIndex({
    id: job.documentIndexId,
    status: RAG_DOCUMENT_INDEX_STATUS.BUILDING,
    readyAt: null,
    unreferencedSince: null,
  })

const now = new Date('2026-10-14T00:00:00.000Z')

test('replaces the complete chunk and relation plan after locking the claimed job and index', async () => {
  const context = createUseCase(buildingIndex())
  const vectors = [[0.2, 0.3]]
  const lexicalSearchTexts = ['heading body']

  await context.useCase.execute(job, plan, vectors, lexicalSearchTexts, now)

  assert.deepEqual(context.events, [
    'lock-document',
    'lock-membership',
    'lock-job',
    'lock-index',
    'delete-chunks',
    'delete-relations',
    'save-chunks',
    'save-relations',
  ])
  assert.deepEqual(context.savedChunks, [
    {
      documentIndexId: 'index-1',
      ordinal: 0,
      headingPath: ['Heading'],
      content: '# Heading\nBody',
      blockStart: 0,
      blockEnd: 2,
      tokenCount: 4,
      embedding: [0.2, 0.3],
      searchVector: 'heading body',
    },
  ])
  assert.deepEqual(context.savedRelations, plan.relations)
})

test('prepares both empty replacement sets and clears old rows for an empty plan', async () => {
  const context = createUseCase(buildingIndex())

  await context.useCase.execute(job, { chunks: [], relations: [] }, [], [], now)

  assert.deepEqual(context.events, [
    'lock-document',
    'lock-membership',
    'lock-job',
    'lock-index',
    'delete-chunks',
    'delete-relations',
    'save-chunks',
    'save-relations',
  ])
  assert.deepEqual(context.savedChunks, [])
  assert.deepEqual(context.savedRelations, [])
})

test('does not enter the transaction when an output is missing', async () => {
  const context = createUseCase(buildingIndex())

  await assert.rejects(
    context.useCase.execute(job, plan, [], ['heading body'], now),
    KnowledgeEmbeddingUnavailableException,
  )

  assert.equal(context.transactionCount, 0)
  assert.deepEqual(context.events, [])
})

test('leaves a ready index unchanged', async () => {
  const context = createUseCase(
    new RagDocumentIndex({
      id: job.documentIndexId,
      status: RAG_DOCUMENT_INDEX_STATUS.READY,
      readyAt: now,
      unreferencedSince: null,
    }),
  )

  await context.useCase.execute(job, plan, [[0.2]], ['heading body'], now)

  assert.deepEqual(context.events, ['lock-document', 'lock-membership', 'lock-job', 'lock-index'])
  assert.deepEqual(context.savedChunks, [])
  assert.deepEqual(context.savedRelations, [])
})

test('fails without writes when the locked index is missing', async () => {
  const context = createUseCase(null)

  await assert.rejects(
    context.useCase.execute(job, plan, [[0.2]], ['heading body'], now),
    KnowledgeIndexPendingException,
  )

  assert.deepEqual(context.events, ['lock-document', 'lock-membership', 'lock-job', 'lock-index'])
  assert.deepEqual(context.savedChunks, [])
  assert.deepEqual(context.savedRelations, [])
})

test('rejects a superseded generation before replacing any rows', async () => {
  const context = createUseCase(buildingIndex(), 2)

  await assert.rejects(context.useCase.execute(job, plan, [[0.2]], ['heading body'], now), InvalidRagJobLeaseException)

  assert.deepEqual(context.events, ['lock-document', 'lock-membership'])
  assert.deepEqual(context.savedChunks, [])
  assert.deepEqual(context.savedRelations, [])
})
