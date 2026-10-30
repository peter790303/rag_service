import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDocumentFixture,
  createRestoredKnowledgeBaseDocumentFixture,
  createRestoredDocumentIndexFixture,
  createJobRecordFixture,
  createRepositoryStub,
} from './document-index-lifecycle.fixture.ts'
import { ReplaceIndexChunkCommandHandler } from '../../../src/Chunks/Application/Commands/replace-index-chunk.command.handler.ts'
import type { MarkdownChunkPlan } from '../../../src/Chunks/Application/DataTransferObjects/markdown-chunk-plan.dto.ts'
import type { InsertChunksQO } from '../../../src/Chunks/Application/QueryObjects/insert-chunks.query-object.ts'
import { AuthorizeDocumentIndexChunkReplacementCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/authorize-document-index-chunk-replacement.command.handler.ts'
import type { AuthorizeDocumentIndexChunkReplacementCommandHandlerContract } from '../../../src/DocumentIndexes/Application/Contracts/authorize-document-index-chunk-replacement.command.handler.contract.ts'
import type { DocumentIndexingClaimDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-indexing-claim.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/DocumentIndexes/Application/Enums/document-index-execution-stage.enum.ts'
import { IndexDisappearedBeforeCompletionException } from '../../../src/DocumentIndexes/Application/Exceptions/index-disappeared-before-completion.exception.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../src/DocumentIndexes/Application/Exceptions/invalid-document-index-execution-lease.exception.ts'
import type { DocumentIndex } from '../../../src/DocumentIndexes/Domain/Entities/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { ReplacePlannedDocumentRelationsCommandHandler } from '../../../src/DocumentRelations/Application/Commands/replace-planned-document-relations.command.handler.ts'
import type { ReplacePlannedDocumentRelationsCommandHandlerContract } from '../../../src/DocumentRelations/Application/Contracts/replace-planned-document-relations.command.handler.contract.ts'
import type { PlannedDocumentRelationWriteQO } from '../../../src/DocumentRelations/Application/QueryObjects/document-relation.query-object.ts'
import { ReserveDocumentForIndexingCommandHandler } from '../../../src/Documents/Application/Commands/reserve-document-for-indexing.command.handler.ts'
import { ReserveKnowledgeBaseDocumentForIndexingCommandHandler } from '../../../src/KnowledgeBaseDocuments/Application/Commands/reserve-knowledge-base-document-for-indexing.command.handler.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/KnowledgeBases/Application/Exceptions/knowledge-embedding-unavailable.exception.ts'

const claimedJobFixture: DocumentIndexingClaimDTO = {
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
  const insertedChunks: InsertChunksQO['chunks'][number][] = []
  const savedRelations: PlannedDocumentRelationWriteQO[] = []
  let transactionCount = 0
  const useCase = new ReplaceIndexChunkCommandHandler(
    {
      runReadOnlySnapshot: async () => assert.fail('replacing chunks uses a write transaction'),
      run: async (replaceChunksOperation) => {
        transactionCount += 1

        return replaceChunksOperation()
      },
    },
    new AuthorizeDocumentIndexChunkReplacementCommandHandler(
      new ReserveDocumentForIndexingCommandHandler(
        createRepositoryStub<ConstructorParameters<typeof ReserveDocumentForIndexingCommandHandler>[0]>({
          lockByDocumentId: async () => {
            events.push('lock-document')

            return createDocumentFixture()
          },
        }),
      ),
      new ReserveKnowledgeBaseDocumentForIndexingCommandHandler(
        createRepositoryStub<ConstructorParameters<typeof ReserveKnowledgeBaseDocumentForIndexingCommandHandler>[0]>({
          lockByKnowledgeBaseIdAndDocumentId: async () => {
            events.push('lock-knowledgeBaseDocument')

            return createRestoredKnowledgeBaseDocumentFixture({ requestedGeneration: String(requestedGeneration) })
          },
        }),
      ),
      createRepositoryStub<ConstructorParameters<typeof AuthorizeDocumentIndexChunkReplacementCommandHandler>[2]>({
        lockExecution: async (jobIdQO) => {
          events.push('lock-job')
          assert.equal(jobIdQO.jobId, claimedJobFixture.id)

          return createJobRecordFixture({
            ...claimedJobFixture,
            leaseExpiresAt: new Date(Date.now() + 60_000),
          })
        },
      }),
      createRepositoryStub<ConstructorParameters<typeof AuthorizeDocumentIndexChunkReplacementCommandHandler>[3]>({
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
    createRepositoryStub<ConstructorParameters<typeof ReplaceIndexChunkCommandHandler>[2]>({
      removeByDocumentIndexId: async (chunkIndexQO) => {
        events.push('delete-chunks')
        assert.equal(chunkIndexQO.documentIndexId, claimedJobFixture.documentIndexId)
      },
      insertChunks: async (insertChunksQO) => {
        events.push('insert-chunks')
        insertedChunks.push(...insertChunksQO.chunks)
      },
    }),
    new ReplacePlannedDocumentRelationsCommandHandler(
      createRepositoryStub<ConstructorParameters<typeof ReplacePlannedDocumentRelationsCommandHandler>[0]>({
        removeBySourceIndexId: async (documentRelationSourceIndexQO) => {
          events.push('delete-relations')
          assert.equal(documentRelationSourceIndexQO.sourceIndexId, claimedJobFixture.documentIndexId)
        },
        insertPlanned: async (insertPlannedDocumentRelationsQO) => {
          events.push('save-relations')
          assert.ok(
            insertPlannedDocumentRelationsQO.relations.every(
              (relation) => relation.sourceIndexId === claimedJobFixture.documentIndexId,
            ),
          )
          savedRelations.push(...insertPlannedDocumentRelationsQO.relations)
        },
      }),
    ),
  )

  return {
    useCase,
    events,
    insertedChunks,
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
  const prepareReplacement: AuthorizeDocumentIndexChunkReplacementCommandHandlerContract = {
    execute: async (authorizeReplacementCommand) => {
      assert.equal(transactionActive, true)
      assert.deepEqual(authorizeReplacementCommand.delivery, {
        id: claimedJobFixture.id,
        knowledgeBaseId: claimedJobFixture.knowledgeBaseId,
        documentId: claimedJobFixture.documentId,
        documentIndexId: claimedJobFixture.documentIndexId,
        generation: claimedJobFixture.generation,
        attempts: claimedJobFixture.attempts,
        leaseToken: claimedJobFixture.leaseToken,
        leaseExpiresAt: claimedJobFixture.leaseExpiresAt,
      })
      assert.notEqual(authorizeReplacementCommand.delivery, claimedJobFixture)
      assert.notEqual(authorizeReplacementCommand.delivery.leaseExpiresAt, claimedJobFixture.leaseExpiresAt)
      events.push('prepare-replacement')

      return createBuildingDocumentIndexFixture()
    },
  }
  const replaceRelations: ReplacePlannedDocumentRelationsCommandHandlerContract = {
    execute: async ({ documentIndexId, plannedDocumentRelations: plannedRelations }) => {
      assert.equal(transactionActive, true)
      assert.equal(documentIndexId, claimedJobFixture.documentIndexId)
      assert.deepEqual(plannedRelations, chunkReplacementPlanFixture.relations)
      assert.notEqual(plannedRelations, chunkReplacementPlanFixture.relations)
      events.push('replace-relations')
    },
  }
  const useCase = new ReplaceIndexChunkCommandHandler(
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
    createRepositoryStub<ConstructorParameters<typeof ReplaceIndexChunkCommandHandler>[2]>({
      removeByDocumentIndexId: async () => {
        assert.equal(transactionActive, true)
        events.push('delete-chunks')
      },
      insertChunks: async () => {
        assert.equal(transactionActive, true)
        events.push('insert-chunks')
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

  assert.deepEqual(events, [
    'begin',
    'prepare-replacement',
    'delete-chunks',
    'insert-chunks',
    'replace-relations',
    'end',
  ])
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
    'lock-knowledgeBaseDocument',
    'lock-job',
    'lock-index',
    'delete-chunks',
    'insert-chunks',
    'delete-relations',
    'save-relations',
  ])
  assert.match(
    context.insertedChunks[0]?.id ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  assert.deepEqual(context.insertedChunks, [
    {
      id: context.insertedChunks[0]?.id,
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
    'lock-knowledgeBaseDocument',
    'lock-job',
    'lock-index',
    'delete-chunks',
    'insert-chunks',
    'delete-relations',
    'save-relations',
  ])
  assert.deepEqual(context.insertedChunks, [])
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

  assert.deepEqual(context.events, ['lock-document', 'lock-knowledgeBaseDocument', 'lock-job', 'lock-index'])
  assert.deepEqual(context.insertedChunks, [])
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

  assert.deepEqual(context.events, ['lock-document', 'lock-knowledgeBaseDocument', 'lock-job', 'lock-index'])
  assert.deepEqual(context.insertedChunks, [])
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

  assert.deepEqual(context.events, ['lock-document', 'lock-knowledgeBaseDocument'])
  assert.deepEqual(context.insertedChunks, [])
  assert.deepEqual(context.savedRelations, [])
})
