import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  RagChunkReplacementWrite,
  RagIndexChunkReplacementOperations,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-index-chunk-replacement-store.js'
import type { ClaimedRagIndexJob } from '../../../src/Application/KnowledgeBases/DataTransferObjects/rag-index-job.dto.js'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/KnowledgeBases/UseCases/replace-index-chunk.use-case.js'
import { RAG_DOCUMENT_INDEX_STATUS } from '../../../src/Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagExecutionStageEnum } from '../../../src/Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { ChunkPlanningUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/chunk-planning-unavailable.exception.js'
import { InvalidRagJobLeaseException } from '../../../src/Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import type { MarkdownPlan, PlannedRelation } from '../../../src/Domain/Knowledge/markdown-chunk.factory.js'
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

const createPlan = (): MarkdownPlan => ({
  chunks: [{ content: 'Original body', headingPath: ['Original'], blockStart: 0, blockEnd: 2, tokenCount: 4 }],
  relations: [
    {
      targetReference: 'Original.md',
      targetAnchor: null,
      relationType: 'wiki_link',
      evidenceBlockStart: 0,
      evidenceBlockEnd: 1,
      evidenceText: '[[Original.md]]',
    },
  ],
})

const createHarness = (overrides: Partial<RagIndexChunkReplacementOperations> = {}) => {
  const events: string[] = []
  const savedChunks: RagChunkReplacementWrite[] = []
  const savedRelations: PlannedRelation[] = []
  const operations: RagIndexChunkReplacementOperations = {
    lockDocument: async () => {
      events.push('lock-document')

      return true
    },
    lockMembership: async () => {
      events.push('lock-membership')

      return { requestedGeneration: 1 }
    },
    lockClaimedJob: async () => {
      events.push('lock-job')
    },
    lockDocumentIndex: async () => {
      events.push('lock-index')

      return new RagDocumentIndex({
        id: job.documentIndexId,
        status: RAG_DOCUMENT_INDEX_STATUS.BUILDING,
        readyAt: null,
        unreferencedSince: null,
      })
    },
    deleteChunksForIndex: async () => {
      events.push('delete-chunks')
    },
    deleteRelationsForIndex: async () => {
      events.push('delete-relations')
    },
    saveChunks: async (rows) => {
      events.push('save-chunks')
      savedChunks.push(...rows)
    },
    saveRelations: async (_id, rows) => {
      events.push('save-relations')
      savedRelations.push(...rows)
    },
    ...overrides,
  }
  const store = {
    withReplacementTransaction: async <T>(operation: (tx: RagIndexChunkReplacementOperations) => Promise<T>) => {
      events.push('transaction-open')
      try {
        const result = await operation(operations)
        events.push('transaction-success')

        return result
      } catch (error) {
        events.push('transaction-error')
        throw error
      }
    },
  }

  return { useCase: new ReplaceIndexChunkUseCase(store), events, savedChunks, savedRelations }
}

test('replacement rejects invalid claim before inspecting or mutating the index', async () => {
  const leaseError = new InvalidRagJobLeaseException()
  const harness = createHarness({
    lockClaimedJob: async () => {
      throw leaseError
    },
  })

  await assert.rejects(harness.useCase.execute(job, createPlan(), [[1, 2]], ['original'], new Date()), leaseError)
  assert.deepEqual(harness.events, ['transaction-open', 'lock-document', 'lock-membership', 'transaction-error'])
  assert.deepEqual(harness.savedChunks, [])
  assert.deepEqual(harness.savedRelations, [])
})

test('replacement rejects missing document or membership and stale generation before destructive writes', async (t) => {
  const scenarios: { name: string; overrides: Partial<RagIndexChunkReplacementOperations> }[] = [
    { name: 'missing document', overrides: { lockDocument: async () => false } },
    { name: 'missing membership', overrides: { lockMembership: async () => null } },
    { name: 'superseded generation', overrides: { lockMembership: async () => ({ requestedGeneration: 2 }) } },
  ]
  await Promise.all(
    scenarios.map(({ name, overrides }) =>
      t.test(name, async () => {
        const harness = createHarness(overrides)
        await assert.rejects(
          harness.useCase.execute(job, createPlan(), [[1, 2]], ['original'], new Date()),
          InvalidRagJobLeaseException,
        )
        assert.ok(!harness.events.includes('lock-job'))
        assert.ok(!harness.events.includes('lock-index'))
        assert.ok(!harness.events.some((event) => event.startsWith('delete-') || event.startsWith('save-')))
      }),
    ),
  )
})

test('READY replacement validates ownership but preserves all chunks and relations', async () => {
  const harness = createHarness({
    lockDocumentIndex: async () =>
      new RagDocumentIndex({
        id: job.documentIndexId,
        status: RAG_DOCUMENT_INDEX_STATUS.READY,
        readyAt: new Date(),
        unreferencedSince: null,
      }),
  })

  await harness.useCase.execute(job, createPlan(), [[1, 2]], ['original'], new Date())
  assert.deepEqual(harness.events, [
    'transaction-open',
    'lock-document',
    'lock-membership',
    'lock-job',
    'transaction-success',
  ])
  assert.deepEqual(harness.savedChunks, [])
  assert.deepEqual(harness.savedRelations, [])
})

test('relation persistence failure propagates through the transaction after chunk writes', async () => {
  const relationError = new Error('relation persistence unavailable')
  const harness = createHarness({
    saveRelations: async () => {
      throw relationError
    },
  })

  await assert.rejects(harness.useCase.execute(job, createPlan(), [[1, 2]], ['original'], new Date()), relationError)
  assert.deepEqual(harness.events, [
    'transaction-open',
    'lock-document',
    'lock-membership',
    'lock-job',
    'lock-index',
    'delete-chunks',
    'delete-relations',
    'save-chunks',
    'transaction-error',
  ])
})

test('replacement snapshots nested chunk, vector, relation and lexical payloads before awaiting locks', async () => {
  const plan = createPlan()
  const vectors = [[1, 2]]
  const searchTexts = ['original']
  const harness = createHarness({
    lockClaimedJob: async () => {
      const chunk = plan.chunks[0]!
      chunk.content = 'Changed body'
      chunk.headingPath.push('Changed')
      plan.relations[0]!.targetReference = 'Changed.md'
      plan.relations[0]!.evidenceText = 'Changed evidence'
      vectors[0]![0] = 99
      searchTexts[0] = 'changed'
    },
  })

  await harness.useCase.execute(job, plan, vectors, searchTexts, new Date())
  assert.deepEqual(harness.savedChunks, [
    {
      documentIndexId: job.documentIndexId,
      ordinal: 0,
      content: 'Original body',
      headingPath: ['Original'],
      blockStart: 0,
      blockEnd: 2,
      tokenCount: 4,
      embedding: [1, 2],
      searchVector: 'original',
    },
  ])
  assert.deepEqual(harness.savedRelations, createPlan().relations)
  assert.notEqual(harness.savedChunks[0]!.headingPath, plan.chunks[0]!.headingPath)
  assert.notEqual(harness.savedChunks[0]!.embedding, vectors[0])
  assert.notEqual(harness.savedRelations[0], plan.relations[0])
})

test('invalid numeric replacement payloads fail before opening a transaction', async (t) => {
  const scenarios = [
    { name: 'NaN embedding', vectors: [[NaN]], exception: KnowledgeEmbeddingUnavailableException },
    { name: 'infinite embedding', vectors: [[Infinity]], exception: KnowledgeEmbeddingUnavailableException },
    { name: 'empty embedding', vectors: [[]], exception: KnowledgeEmbeddingUnavailableException },
  ]
  await Promise.all(
    scenarios.map(({ name, vectors, exception }) =>
      t.test(name, async () => {
        const harness = createHarness()
        await assert.rejects(harness.useCase.execute(job, createPlan(), vectors, ['original'], new Date()), exception)
        assert.deepEqual(harness.events, [])
      }),
    ),
  )
  await t.test('fractional block offset', async () => {
    const harness = createHarness()
    const plan = createPlan()
    plan.chunks[0]!.blockStart = 0.5
    await assert.rejects(
      harness.useCase.execute(job, plan, [[1]], ['original'], new Date()),
      ChunkPlanningUnavailableException,
    )
    assert.deepEqual(harness.events, [])
  })
  await t.test('negative token count', async () => {
    const harness = createHarness()
    const plan = createPlan()
    plan.chunks[0]!.tokenCount = -1
    await assert.rejects(
      harness.useCase.execute(job, plan, [[1]], ['original'], new Date()),
      ChunkPlanningUnavailableException,
    )
    assert.deepEqual(harness.events, [])
  })
  await t.test('invalid replacement timestamp', async () => {
    const harness = createHarness()
    await assert.rejects(harness.useCase.execute(job, createPlan(), [[1]], ['original'], new Date(NaN)), TypeError)
    assert.deepEqual(harness.events, [])
  })
})
