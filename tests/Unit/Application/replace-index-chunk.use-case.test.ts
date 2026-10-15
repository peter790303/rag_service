import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDocumentFixture,
  createRestoredMembershipFixture,
  createRestoredDocumentIndexFixture,
  createIndexJobRecordFixture,
  createRepositoryStub,
} from './document-index-lifecycle.fixture.ts'
import type { MarkdownChunkPlan } from '../../../src/Application/Chunks/DataTransferObjects/markdown-chunk-plan.dto.ts'
import type { SaveChunksQueryObject } from '../../../src/Application/Chunks/QueryObjects/save-chunks.query-object.ts'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/Chunks/UseCases/replace-index-chunk.use-case.ts'
import type { PrepareChunkReplacementUseCaseContract } from '../../../src/Application/DocumentIndexes/Contracts/prepare-chunk-replacement.use-case.contract.ts'
import type { ClaimedIndexJobDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/index-job.dto.ts'
import { IndexJobExecutionStageEnum } from '../../../src/Application/DocumentIndexes/Enums/index-job-execution-stage.enum.ts'
import { InvalidIndexJobLeaseException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-index-job-lease.exception.ts'
import { PrepareChunkReplacementUseCase } from '../../../src/Application/DocumentIndexes/UseCases/prepare-chunk-replacement.use-case.ts'
import type { ReplacePlannedDocumentRelationsUseCaseContract } from '../../../src/Application/DocumentRelations/Contracts/replace-planned-document-relations.use-case.contract.ts'
import { ReplacePlannedDocumentRelationsUseCase } from '../../../src/Application/DocumentRelations/UseCases/replace-planned-document-relations.use-case.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Application/KnowledgeBases/Exceptions/knowledge-embedding-unavailable.exception.ts'
import { ReserveMembershipForIndexingUseCase } from '../../../src/Application/Memberships/UseCases/reserve-membership-for-indexing.use-case.ts'
import { DocumentIndex } from '../../../src/Domain/DocumentIndex/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { KnowledgeIndexPendingException } from '../../../src/Domain/DocumentIndex/Exceptions/knowledge-index-pending.exception.ts'

const claimedIndexJobFixture: ClaimedIndexJobDto = {
  id: 'job-1',
  knowledgeBaseId: 'kb-1',
  documentId: 'doc-1',
  documentIndexId: 'index-1',
  generation: '1',
  attempts: 1,
  leaseToken: 'lease-1',
  leaseExpiresAt: new Date('2026-10-14T00:00:00.000Z'),
  executionVerification: {
    stage: IndexJobExecutionStageEnum.CLAIMED,
    completedUnits: 0,
    totalUnits: null,
    verifiedAt: null,
  },
}

const chunkReplacementPlanFixture: MarkdownChunkPlan = {
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

const createReplaceIndexChunkScenario = (index: DocumentIndex | null, requestedGeneration = 1) => {
  const events: string[] = []
  const savedChunks: SaveChunksQueryObject['chunks'][number][] = []
  const savedRelations: unknown[] = []
  let transactionCount = 0
  const useCase = new ReplaceIndexChunkUseCase(
    {
      runReadOnlySnapshot: async () => assert.fail('replacing chunks uses a write transaction'),
      run: async (replaceChunksOperation) => {
        transactionCount += 1

        return replaceChunksOperation()
      },
    },
    new PrepareChunkReplacementUseCase(
      new ReserveDocumentForIndexingUseCase(
        createRepositoryStub<ConstructorParameters<typeof ReserveDocumentForIndexingUseCase>[0]>({
          lockByDocumentId: async () => {
            events.push('lock-document')

            return createDocumentFixture()
          },
        }),
      ),
      new ReserveMembershipForIndexingUseCase(
        createRepositoryStub<ConstructorParameters<typeof ReserveMembershipForIndexingUseCase>[0]>({
          lockByKnowledgeBaseIdAndDocumentId: async () => {
            events.push('lock-membership')

            return createRestoredMembershipFixture({ requestedGeneration: String(requestedGeneration) })
          },
        }),
      ),
      createRepositoryStub<ConstructorParameters<typeof PrepareChunkReplacementUseCase>[2]>({
        lockById: async (indexJobIdQO) => {
          events.push('lock-job')
          assert.equal(indexJobIdQO.jobId, claimedIndexJobFixture.id)

          return createIndexJobRecordFixture({
            ...claimedIndexJobFixture,
            leaseExpiresAt: new Date(Date.now() + 60_000),
          })
        },
      }),
      createRepositoryStub<ConstructorParameters<typeof PrepareChunkReplacementUseCase>[3]>({
        lockByDocumentIndexId: async (documentIndexIdQO) => {
          events.push('lock-index')
          assert.equal(documentIndexIdQO.documentIndexId, claimedIndexJobFixture.documentIndexId)

          return index === null
            ? null
            : createRestoredDocumentIndexFixture({
                id: index.id,
                status: index.status,
                readyAt: index.readyAt,
                unreferencedSince: index.unreferencedSince,
              })
        },
      }),
    ),
    createRepositoryStub<ConstructorParameters<typeof ReplaceIndexChunkUseCase>[2]>({
      removeByDocumentIndexId: async (chunkIndexQO) => {
        events.push('delete-chunks')
        assert.equal(chunkIndexQO.documentIndexId, claimedIndexJobFixture.documentIndexId)
      },
      saveChunks: async (saveChunksQO) => {
        events.push('save-chunks')
        savedChunks.push(...saveChunksQO.chunks)
      },
    }),
    new ReplacePlannedDocumentRelationsUseCase(
      createRepositoryStub<ConstructorParameters<typeof ReplacePlannedDocumentRelationsUseCase>[0]>({
        removeBySourceIndexId: async (documentRelationSourceIndexQO) => {
          events.push('delete-relations')
          assert.equal(documentRelationSourceIndexQO.sourceIndexId, claimedIndexJobFixture.documentIndexId)
        },
        savePlanned: async (savePlannedDocumentRelationsQO) => {
          events.push('save-relations')
          assert.ok(
            savePlannedDocumentRelationsQO.relations.every(
              (relation) => relation.sourceIndexId === claimedIndexJobFixture.documentIndexId,
            ),
          )
          savedRelations.push(...savePlannedDocumentRelationsQO.relations)
        },
      }),
    ),
  )

  return {
    useCase,
    events,
    savedChunks,
    savedRelations,
    get transactionCount() {
      return transactionCount
    },
  }
}

const createBuildingDocumentIndexFixture = () =>
  new DocumentIndex({
    id: claimedIndexJobFixture.documentIndexId,
    status: DocumentIndexStatusEnum.BUILDING,
    readyAt: null,
    unreferencedSince: null,
  })

const now = new Date('2026-10-14T00:00:00.000Z')

test('orchestrates public feature contracts inside the chunk transaction without foreign repositories', async () => {
  const events: string[] = []
  let transactionActive = false
  const prepareReplacement: PrepareChunkReplacementUseCaseContract = {
    execute: async (indexJob) => {
      assert.equal(transactionActive, true)
      assert.equal(indexJob, claimedIndexJobFixture)
      events.push('prepare-replacement')

      return true
    },
  }
  const replaceRelations: ReplacePlannedDocumentRelationsUseCaseContract = {
    execute: async ({ documentIndexId, plannedDocumentRelations: plannedRelations }) => {
      assert.equal(transactionActive, true)
      assert.equal(documentIndexId, claimedIndexJobFixture.documentIndexId)
      assert.deepEqual(plannedRelations, chunkReplacementPlanFixture.relations)
      assert.notEqual(plannedRelations, chunkReplacementPlanFixture.relations)
      events.push('replace-relations')
    },
  }
  const useCase = new ReplaceIndexChunkUseCase(
    {
      runReadOnlySnapshot: async () => assert.fail('chunk replacement requires a write transaction'),
      run: async (replaceChunksOperation) => {
        transactionActive = true
        events.push('begin')

        try {
          return await replaceChunksOperation()
        } finally {
          transactionActive = false
          events.push('end')
        }
      },
    },
    prepareReplacement,
    createRepositoryStub<ConstructorParameters<typeof ReplaceIndexChunkUseCase>[2]>({
      removeByDocumentIndexId: async () => {
        assert.equal(transactionActive, true)
        events.push('delete-chunks')
      },
      saveChunks: async () => {
        assert.equal(transactionActive, true)
        events.push('save-chunks')
      },
    }),
    replaceRelations,
  )

  await useCase.execute({
    indexJob: claimedIndexJobFixture,
    markdownChunkPlan: chunkReplacementPlanFixture,
    chunkEmbeddings: [[1, 0]],
    lexicalSearchTexts: ['heading body'],
    now: new Date(),
  })

  assert.deepEqual(events, ['begin', 'prepare-replacement', 'delete-chunks', 'save-chunks', 'replace-relations', 'end'])
})

test('replaces the complete chunk and relation plan after locking the claimed job and index', async () => {
  const context = createReplaceIndexChunkScenario(createBuildingDocumentIndexFixture())
  const vectors = [[0.2, 0.3]]
  const lexicalSearchTexts = ['heading body']

  await context.useCase.execute({
    indexJob: claimedIndexJobFixture,
    markdownChunkPlan: chunkReplacementPlanFixture,
    chunkEmbeddings: vectors,
    lexicalSearchTexts: lexicalSearchTexts,
    now: now,
  })

  assert.deepEqual(context.events, [
    'lock-document',
    'lock-membership',
    'lock-job',
    'lock-index',
    'delete-chunks',
    'save-chunks',
    'delete-relations',
    'save-relations',
  ])
  assert.match(
    context.savedChunks[0]?.id ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  assert.deepEqual(context.savedChunks, [
    {
      id: context.savedChunks[0]?.id,
      documentIndexId: 'index-1',
      ordinal: 0,
      headingPath: ['Heading'],
      content: '# Heading\nBody',
      blockStart: 0,
      blockEnd: 2,
      tokenCount: 4,
      embedding: [0.2, 0.3],
      searchVector: 'heading body',
      createdAt: now,
    },
  ])
  assert.deepEqual(
    context.savedRelations,
    chunkReplacementPlanFixture.relations.map((relation) => ({
      sourceIndexId: claimedIndexJobFixture.documentIndexId,
      targetDocumentId: null,
      ...relation,
    })),
  )
})

test('prepares both empty replacement sets and clears old rows for an empty plan', async () => {
  const context = createReplaceIndexChunkScenario(createBuildingDocumentIndexFixture())

  await context.useCase.execute({
    indexJob: claimedIndexJobFixture,
    markdownChunkPlan: { chunks: [], relations: [] },
    chunkEmbeddings: [],
    lexicalSearchTexts: [],
    now: now,
  })

  assert.deepEqual(context.events, [
    'lock-document',
    'lock-membership',
    'lock-job',
    'lock-index',
    'delete-chunks',
    'save-chunks',
    'delete-relations',
    'save-relations',
  ])
  assert.deepEqual(context.savedChunks, [])
  assert.deepEqual(context.savedRelations, [])
})

test('does not enter the transaction when an output is missing', async () => {
  const context = createReplaceIndexChunkScenario(createBuildingDocumentIndexFixture())

  await assert.rejects(
    context.useCase.execute({
      indexJob: claimedIndexJobFixture,
      markdownChunkPlan: chunkReplacementPlanFixture,
      chunkEmbeddings: [],
      lexicalSearchTexts: ['heading body'],
      now: now,
    }),
    KnowledgeEmbeddingUnavailableException,
  )

  assert.equal(context.transactionCount, 0)
  assert.deepEqual(context.events, [])
})

test('leaves a ready index unchanged', async () => {
  const context = createReplaceIndexChunkScenario(
    new DocumentIndex({
      id: claimedIndexJobFixture.documentIndexId,
      status: DocumentIndexStatusEnum.READY,
      readyAt: now,
      unreferencedSince: null,
    }),
  )

  await context.useCase.execute({
    indexJob: claimedIndexJobFixture,
    markdownChunkPlan: chunkReplacementPlanFixture,
    chunkEmbeddings: [[0.2]],
    lexicalSearchTexts: ['heading body'],
    now: now,
  })

  assert.deepEqual(context.events, ['lock-document', 'lock-membership', 'lock-job', 'lock-index'])
  assert.deepEqual(context.savedChunks, [])
  assert.deepEqual(context.savedRelations, [])
})

test('fails without writes when the locked index is missing', async () => {
  const context = createReplaceIndexChunkScenario(null)

  await assert.rejects(
    context.useCase.execute({
      indexJob: claimedIndexJobFixture,
      markdownChunkPlan: chunkReplacementPlanFixture,
      chunkEmbeddings: [[0.2]],
      lexicalSearchTexts: ['heading body'],
      now: now,
    }),
    KnowledgeIndexPendingException,
  )

  assert.deepEqual(context.events, ['lock-document', 'lock-membership', 'lock-job', 'lock-index'])
  assert.deepEqual(context.savedChunks, [])
  assert.deepEqual(context.savedRelations, [])
})

test('rejects a superseded generation before replacing any rows', async () => {
  const context = createReplaceIndexChunkScenario(createBuildingDocumentIndexFixture(), 2)

  await assert.rejects(
    context.useCase.execute({
      indexJob: claimedIndexJobFixture,
      markdownChunkPlan: chunkReplacementPlanFixture,
      chunkEmbeddings: [[0.2]],
      lexicalSearchTexts: ['heading body'],
      now: now,
    }),
    InvalidIndexJobLeaseException,
  )

  assert.deepEqual(context.events, ['lock-document', 'lock-membership'])
  assert.deepEqual(context.savedChunks, [])
  assert.deepEqual(context.savedRelations, [])
})
