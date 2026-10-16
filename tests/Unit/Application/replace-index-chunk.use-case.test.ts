import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDocumentFixture,
  createRestoredMembershipFixture,
  createRestoredDocumentIndexFixture,
  createJobRecordFixture,
  createRepositoryStub,
} from './document-index-lifecycle.fixture.ts'
import type { MarkdownChunkPlan } from '../../../src/Application/Chunks/DataTransferObjects/markdown-chunk-plan.dto.ts'
import type { SaveChunksQueryObject } from '../../../src/Application/Chunks/QueryObjects/save-chunks.query-object.ts'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/Chunks/UseCases/replace-index-chunk.use-case.ts'
import type { DocumentIndexChunkReplacementRequestedListenerContract } from '../../../src/Application/DocumentIndexes/Contracts/document-index-chunk-replacement-requested.listener.contract.ts'
import type { DocumentIndexingClaimDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-indexing-claim.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/Application/DocumentIndexes/Enums/document-index-execution-stage.enum.ts'
import { DocumentIndexChunkReplacementRequestedEvent } from '../../../src/Application/DocumentIndexes/Events/document-index-chunk-replacement-requested.event.ts'
import { IndexDisappearedBeforeCompletionException } from '../../../src/Application/DocumentIndexes/Exceptions/index-disappeared-before-completion.exception.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-document-index-execution-lease.exception.ts'
import { DocumentIndexChunkReplacementRequestedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-index-chunk-replacement-requested.listener.ts'
import type { ReplacePlannedDocumentRelationsUseCaseContract } from '../../../src/Application/DocumentRelations/Contracts/replace-planned-document-relations.use-case.contract.ts'
import type { PlannedDocumentRelationWrite } from '../../../src/Application/DocumentRelations/QueryObjects/document-relation.query-object.ts'
import { ReplacePlannedDocumentRelationsUseCase } from '../../../src/Application/DocumentRelations/UseCases/replace-planned-document-relations.use-case.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Application/KnowledgeBases/Exceptions/knowledge-embedding-unavailable.exception.ts'
import { ReserveMembershipForIndexingUseCase } from '../../../src/Application/Memberships/UseCases/reserve-membership-for-indexing.use-case.ts'
import type { DocumentIndex } from '../../../src/Domain/DocumentIndex/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'

const claimedJobFixture: DocumentIndexingClaimDto = {
  id: 'job-1',
  knowledgeBaseId: 'kb-1',
  documentId: 'doc-1',
  documentIndexId: 'index-1',
  generation: '1',
  attempts: 1,
  leaseToken: 'lease-1',
  leaseExpiresAt: new Date('2026-10-14T00:00:00.000Z'),
  executionVerification: {
    stage: DocumentIndexExecutionStageEnum.CLAIMED,
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
  const savedRelations: PlannedDocumentRelationWrite[] = []
  let transactionCount = 0
  const useCase = new ReplaceIndexChunkUseCase(
    {
      runReadOnlySnapshot: async () => assert.fail('replacing chunks uses a write transaction'),
      run: async (replaceChunksOperation) => {
        transactionCount += 1

        return replaceChunksOperation()
      },
    },
    new DocumentIndexChunkReplacementRequestedListener(
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
      createRepositoryStub<ConstructorParameters<typeof DocumentIndexChunkReplacementRequestedListener>[2]>({
        lockExecution: async (jobIdQO) => {
          events.push('lock-job')
          assert.equal(jobIdQO.jobId, claimedJobFixture.id)

          return createJobRecordFixture({
            ...claimedJobFixture,
            leaseExpiresAt: new Date(Date.now() + 60_000),
          })
        },
      }),
      createRepositoryStub<ConstructorParameters<typeof DocumentIndexChunkReplacementRequestedListener>[3]>({
        lockByDocumentIndexId: async (documentIndexIdQO) => {
          events.push('lock-index')
          assert.equal(documentIndexIdQO.documentIndexId, claimedJobFixture.documentIndexId)

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
        assert.equal(chunkIndexQO.documentIndexId, claimedJobFixture.documentIndexId)
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
          assert.equal(documentRelationSourceIndexQO.sourceIndexId, claimedJobFixture.documentIndexId)
        },
        savePlanned: async (savePlannedDocumentRelationsQO) => {
          events.push('save-relations')
          assert.ok(
            savePlannedDocumentRelationsQO.relations.every(
              (relation) => relation.sourceIndexId === claimedJobFixture.documentIndexId,
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
  createRestoredDocumentIndexFixture({
    id: claimedJobFixture.documentIndexId,
    status: DocumentIndexStatusEnum.BUILDING,
    readyAt: null,
    unreferencedSince: null,
  })

const now = new Date('2026-10-14T00:00:00.000Z')

test('orchestrates public feature contracts inside the chunk transaction without foreign repositories', async () => {
  const events: string[] = []
  let transactionActive = false
  const prepareReplacement: DocumentIndexChunkReplacementRequestedListenerContract = {
    handle: async (event) => {
      assert.equal(transactionActive, true)
      assert.ok(event instanceof DocumentIndexChunkReplacementRequestedEvent)
      assert.deepEqual(event.delivery, claimedJobFixture)
      assert.notEqual(event.delivery, claimedJobFixture)
      assert.notEqual(event.delivery.leaseExpiresAt, claimedJobFixture.leaseExpiresAt)
      events.push('prepare-replacement')

      return createBuildingDocumentIndexFixture()
    },
  }
  const replaceRelations: ReplacePlannedDocumentRelationsUseCaseContract = {
    execute: async ({ documentIndexId, plannedDocumentRelations: plannedRelations }) => {
      assert.equal(transactionActive, true)
      assert.equal(documentIndexId, claimedJobFixture.documentIndexId)
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
    job: claimedJobFixture,
    markdownChunkPlan: chunkReplacementPlanFixture,
    chunkEmbeddings: [[1, 0]],
    now: new Date(),
  })

  assert.deepEqual(events, ['begin', 'prepare-replacement', 'delete-chunks', 'save-chunks', 'replace-relations', 'end'])
})

test('replaces the complete chunk and relation plan after locking the claimed job and index', async () => {
  const context = createReplaceIndexChunkScenario(createBuildingDocumentIndexFixture())
  const vectors = [[0.2, 0.3]]

  await context.useCase.execute({
    job: claimedJobFixture,
    markdownChunkPlan: chunkReplacementPlanFixture,
    chunkEmbeddings: vectors,
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
      createdAt: now,
    },
  ])
  assert.match(
    context.savedRelations[0]?.id ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  assert.deepEqual(
    context.savedRelations,
    chunkReplacementPlanFixture.relations.map((relation, index) => ({
      id: context.savedRelations[index]?.id,
      sourceIndexId: claimedJobFixture.documentIndexId,
      targetDocumentId: null,
      ...relation,
    })),
  )
})

test('prepares both empty replacement sets and clears old rows for an empty plan', async () => {
  const context = createReplaceIndexChunkScenario(createBuildingDocumentIndexFixture())

  await context.useCase.execute({
    job: claimedJobFixture,
    markdownChunkPlan: { chunks: [], relations: [] },
    chunkEmbeddings: [],
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
      job: claimedJobFixture,
      markdownChunkPlan: chunkReplacementPlanFixture,
      chunkEmbeddings: [],
      now: now,
    }),
    KnowledgeEmbeddingUnavailableException,
  )

  assert.equal(context.transactionCount, 0)
  assert.deepEqual(context.events, [])
})

test('leaves a ready index unchanged', async () => {
  const context = createReplaceIndexChunkScenario(
    createRestoredDocumentIndexFixture({
      id: claimedJobFixture.documentIndexId,
      status: DocumentIndexStatusEnum.READY,
      readyAt: now,
      unreferencedSince: null,
    }),
  )

  await context.useCase.execute({
    job: claimedJobFixture,
    markdownChunkPlan: chunkReplacementPlanFixture,
    chunkEmbeddings: [[0.2]],
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
      job: claimedJobFixture,
      markdownChunkPlan: chunkReplacementPlanFixture,
      chunkEmbeddings: [[0.2]],
      now: now,
    }),
    (error: unknown) => {
      assert.ok(error instanceof IndexDisappearedBeforeCompletionException)
      assert.equal(error.code, 'INDEX_DISAPPEARED_BEFORE_COMPLETION')

      return true
    },
  )

  assert.deepEqual(context.events, ['lock-document', 'lock-membership', 'lock-job', 'lock-index'])
  assert.deepEqual(context.savedChunks, [])
  assert.deepEqual(context.savedRelations, [])
})

test('rejects a superseded generation before replacing any rows', async () => {
  const context = createReplaceIndexChunkScenario(createBuildingDocumentIndexFixture(), 2)

  await assert.rejects(
    context.useCase.execute({
      job: claimedJobFixture,
      markdownChunkPlan: chunkReplacementPlanFixture,
      chunkEmbeddings: [[0.2]],
      now: now,
    }),
    InvalidDocumentIndexExecutionLeaseException,
  )

  assert.deepEqual(context.events, ['lock-document', 'lock-membership'])
  assert.deepEqual(context.savedChunks, [])
  assert.deepEqual(context.savedRelations, [])
})
