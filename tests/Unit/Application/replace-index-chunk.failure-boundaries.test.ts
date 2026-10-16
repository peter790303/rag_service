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
import type { ReplaceIndexChunkInputDto } from '../../../src/Application/Chunks/DataTransferObjects/replace-index-chunk-input.dto.ts'
import { ChunkPlanningUnavailableException } from '../../../src/Application/Chunks/Exceptions/chunk-planning-unavailable.exception.ts'
import { InvalidChunkReplacementTimestampException } from '../../../src/Application/Chunks/Exceptions/invalid-chunk-replacement-timestamp.exception.ts'
import type { SaveChunksQueryObject } from '../../../src/Application/Chunks/QueryObjects/save-chunks.query-object.ts'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/Chunks/UseCases/replace-index-chunk.use-case.ts'
import type { DocumentIndexExecutionLeaseDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-index-execution-lease.dto.ts'
import type { DocumentIndexingClaimDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-indexing-claim.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/Application/DocumentIndexes/Enums/document-index-execution-stage.enum.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-document-index-execution-lease.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { DocumentIndexChunkReplacementRequestedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-index-chunk-replacement-requested.listener.ts'
import type { PlannedDocumentRelationWrite } from '../../../src/Application/DocumentRelations/QueryObjects/document-relation.query-object.ts'
import { ReplacePlannedDocumentRelationsUseCase } from '../../../src/Application/DocumentRelations/UseCases/replace-planned-document-relations.use-case.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Application/KnowledgeBases/Exceptions/knowledge-embedding-unavailable.exception.ts'
import { ReserveMembershipForIndexingUseCase } from '../../../src/Application/Memberships/UseCases/reserve-membership-for-indexing.use-case.ts'
import { ChunkDocumentIndexRequiredException } from '../../../src/Domain/Chunk/Exceptions/chunk-document-index-required.exception.ts'
import { InvalidChunkBlockStartException } from '../../../src/Domain/Chunk/Exceptions/invalid-chunk-block-start.exception.ts'
import { InvalidChunkTokenCountException } from '../../../src/Domain/Chunk/Exceptions/invalid-chunk-token-count.exception.ts'
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

const createChunkReplacementPlanFixture = (): MarkdownChunkPlan => ({
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

const createReplacementJobLeaseFixture = (): DocumentIndexExecutionLeaseDto => ({
  id: claimedJobFixture.id,
  knowledgeBaseId: claimedJobFixture.knowledgeBaseId,
  documentId: claimedJobFixture.documentId,
  documentIndexId: claimedJobFixture.documentIndexId,
  generation: claimedJobFixture.generation,
  attempts: claimedJobFixture.attempts,
  status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
  leaseToken: claimedJobFixture.leaseToken,
  leaseExpiresAt: new Date(Date.now() + 60_000),
})

interface ChunkReplacementScenario {
  lockDocument(): Promise<boolean>
  lockByKnowledgeBaseIdAndDocumentId(): Promise<{ requestedGeneration: number } | null>
  lockJob(): Promise<DocumentIndexExecutionLeaseDto | null>
  lockDocumentIndex(): Promise<DocumentIndex | null>
  deleteChunksForIndex(): Promise<void>
  deleteRelationsForIndex(): Promise<void>
  saveChunks(replacementChunksQO: SaveChunksQueryObject['chunks']): Promise<void>
  saveRelations(plannedRelationsQO: readonly PlannedDocumentRelationWrite[]): Promise<void>
}

const createChunkReplacementScenario = (scenarioOverrides: Partial<ChunkReplacementScenario> = {}) => {
  const events: string[] = []
  const savedChunks: SaveChunksQueryObject['chunks'][number][] = []
  const savedRelations: PlannedDocumentRelationWrite[] = []
  const chunkReplacementOperations: ChunkReplacementScenario = {
    lockDocument: async () => {
      events.push('lock-document')

      return true
    },
    lockByKnowledgeBaseIdAndDocumentId: async () => {
      events.push('lock-membership')

      return { requestedGeneration: 1 }
    },
    lockJob: async () => {
      events.push('lock-job')

      return createReplacementJobLeaseFixture()
    },
    lockDocumentIndex: async () => {
      events.push('lock-index')

      return createRestoredDocumentIndexFixture({
        id: claimedJobFixture.documentIndexId,
        status: DocumentIndexStatusEnum.BUILDING,
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
    saveChunks: async (replacementChunksQO) => {
      events.push('save-chunks')
      savedChunks.push(...replacementChunksQO)
    },
    saveRelations: async (plannedRelationsQO) => {
      events.push('save-relations')
      savedRelations.push(...plannedRelationsQO)
    },
    ...scenarioOverrides,
  }
  const chunkReplacementTransaction = {
    runReadOnlySnapshot: async () => assert.fail('replacing chunks uses a write transaction'),
    run: async <T>(replaceChunksOperation: () => Promise<T>) => {
      events.push('transaction-open')
      try {
        const replacementOutcome = await replaceChunksOperation()
        events.push('transaction-success')

        return replacementOutcome
      } catch (error) {
        events.push('transaction-error')
        throw error
      }
    },
  }

  const useCase = new ReplaceIndexChunkUseCase(
    chunkReplacementTransaction,
    new DocumentIndexChunkReplacementRequestedListener(
      new ReserveDocumentForIndexingUseCase(
        createRepositoryStub<ConstructorParameters<typeof ReserveDocumentForIndexingUseCase>[0]>({
          lockByDocumentId: async () =>
            (await chunkReplacementOperations.lockDocument()) ? createDocumentFixture() : null,
        }),
      ),
      new ReserveMembershipForIndexingUseCase(
        createRepositoryStub<ConstructorParameters<typeof ReserveMembershipForIndexingUseCase>[0]>({
          lockByKnowledgeBaseIdAndDocumentId: async () => {
            const lockedMembershipState = await chunkReplacementOperations.lockByKnowledgeBaseIdAndDocumentId()

            return lockedMembershipState === null
              ? null
              : createRestoredMembershipFixture({
                  requestedGeneration: String(lockedMembershipState.requestedGeneration),
                })
          },
        }),
      ),
      createRepositoryStub<ConstructorParameters<typeof DocumentIndexChunkReplacementRequestedListener>[2]>({
        lockExecution: async () => {
          const lockedJobLease = await chunkReplacementOperations.lockJob()

          return lockedJobLease === null ? null : createJobRecordFixture(lockedJobLease)
        },
      }),
      createRepositoryStub<ConstructorParameters<typeof DocumentIndexChunkReplacementRequestedListener>[3]>({
        lockByDocumentIndexId: async () => {
          const lockedDocumentIndex = await chunkReplacementOperations.lockDocumentIndex()

          return lockedDocumentIndex === null
            ? null
            : createRestoredDocumentIndexFixture({
                id: lockedDocumentIndex.id,
                status: lockedDocumentIndex.status,
                readyAt: lockedDocumentIndex.readyAt,
                unreferencedSince: lockedDocumentIndex.unreferencedSince,
              })
        },
      }),
    ),
    createRepositoryStub<ConstructorParameters<typeof ReplaceIndexChunkUseCase>[2]>({
      removeByDocumentIndexId: chunkReplacementOperations.deleteChunksForIndex,
      saveChunks: (saveChunksQO) => chunkReplacementOperations.saveChunks(saveChunksQO.chunks),
    }),
    new ReplacePlannedDocumentRelationsUseCase(
      createRepositoryStub<ConstructorParameters<typeof ReplacePlannedDocumentRelationsUseCase>[0]>({
        removeBySourceIndexId: chunkReplacementOperations.deleteRelationsForIndex,
        savePlanned: (savePlannedDocumentRelationsQO) =>
          chunkReplacementOperations.saveRelations(savePlannedDocumentRelationsQO.relations),
      }),
    ),
  )

  return { useCase, events, savedChunks, savedRelations }
}

test('replacement rejects missing, fenced or expired job facts before inspecting or mutating the index', async (t) => {
  const facts: {
    name: string
    fact: DocumentIndexExecutionLeaseDto | null
  }[] = [
    { name: 'missing job', fact: null },
    { name: 'different job', fact: { ...createReplacementJobLeaseFixture(), id: 'job-2' } },
    { name: 'different knowledge base', fact: { ...createReplacementJobLeaseFixture(), knowledgeBaseId: 'kb-2' } },
    { name: 'different document', fact: { ...createReplacementJobLeaseFixture(), documentId: 'doc-2' } },
    { name: 'different index', fact: { ...createReplacementJobLeaseFixture(), documentIndexId: 'index-2' } },
    { name: 'different generation', fact: { ...createReplacementJobLeaseFixture(), generation: '2' } },
    { name: 'different attempt', fact: { ...createReplacementJobLeaseFixture(), attempts: 2 } },
    { name: 'different token', fact: { ...createReplacementJobLeaseFixture(), leaseToken: 'lease-2' } },
    { name: 'missing token', fact: { ...createReplacementJobLeaseFixture(), leaseToken: null } },
    {
      name: 'queued job',
      fact: { ...createReplacementJobLeaseFixture(), status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED },
    },
    { name: 'missing expiration', fact: { ...createReplacementJobLeaseFixture(), leaseExpiresAt: null } },
    {
      name: 'expired lease',
      fact: { ...createReplacementJobLeaseFixture(), leaseExpiresAt: new Date(Date.now() - 1) },
    },
  ]
  const assertRejectedFact = ({ name, fact }: (typeof facts)[number]) =>
    t.test(name, async () => {
      const chunkReplacementScenario = createChunkReplacementScenario({ lockJob: async () => fact })

      await assert.rejects(
        chunkReplacementScenario.useCase.execute({
          job: claimedJobFixture,
          markdownChunkPlan: createChunkReplacementPlanFixture(),
          chunkEmbeddings: [[1, 2]],
          now: new Date(),
        }),
        InvalidDocumentIndexExecutionLeaseException,
      )
      assert.deepEqual(chunkReplacementScenario.events, [
        'transaction-open',
        'lock-document',
        'lock-membership',
        'transaction-error',
      ])
      assert.deepEqual(chunkReplacementScenario.savedChunks, [])
      assert.deepEqual(chunkReplacementScenario.savedRelations, [])
    })

  await Promise.all(facts.map(assertRejectedFact))
})

test('replacement rejects missing document or membership and stale generation before destructive writes', async (t) => {
  const scenarios: { name: string; overrides: Partial<ChunkReplacementScenario> }[] = [
    { name: 'missing document', overrides: { lockDocument: async () => false } },
    { name: 'missing membership', overrides: { lockByKnowledgeBaseIdAndDocumentId: async () => null } },
    {
      name: 'superseded generation',
      overrides: { lockByKnowledgeBaseIdAndDocumentId: async () => ({ requestedGeneration: 2 }) },
    },
  ]
  await Promise.all(
    scenarios.map(({ name, overrides: scenarioOverrides }) =>
      t.test(name, async () => {
        const chunkReplacementScenario = createChunkReplacementScenario(scenarioOverrides)
        await assert.rejects(
          chunkReplacementScenario.useCase.execute({
            job: claimedJobFixture,
            markdownChunkPlan: createChunkReplacementPlanFixture(),
            chunkEmbeddings: [[1, 2]],
            now: new Date(),
          }),
          InvalidDocumentIndexExecutionLeaseException,
        )
        assert.ok(!chunkReplacementScenario.events.includes('lock-job'))
        assert.ok(!chunkReplacementScenario.events.includes('lock-index'))
        assert.ok(
          !chunkReplacementScenario.events.some((event) => event.startsWith('delete-') || event.startsWith('save-')),
        )
      }),
    ),
  )
})

test('READY replacement validates ownership but preserves all chunks and relations', async () => {
  const chunkReplacementScenario = createChunkReplacementScenario({
    lockDocumentIndex: async () =>
      createRestoredDocumentIndexFixture({
        id: claimedJobFixture.documentIndexId,
        status: DocumentIndexStatusEnum.READY,
        readyAt: new Date(),
        unreferencedSince: null,
      }),
  })

  await chunkReplacementScenario.useCase.execute({
    job: claimedJobFixture,
    markdownChunkPlan: createChunkReplacementPlanFixture(),
    chunkEmbeddings: [[1, 2]],
    now: new Date(),
  })
  assert.deepEqual(chunkReplacementScenario.events, [
    'transaction-open',
    'lock-document',
    'lock-membership',
    'lock-job',
    'transaction-success',
  ])
  assert.deepEqual(chunkReplacementScenario.savedChunks, [])
  assert.deepEqual(chunkReplacementScenario.savedRelations, [])
})

test('relation persistence failure propagates through the transaction after chunk writes', async () => {
  const relationError = new Error('relation persistence unavailable')
  const chunkReplacementScenario = createChunkReplacementScenario({
    saveRelations: async () => {
      throw relationError
    },
  })

  await assert.rejects(
    chunkReplacementScenario.useCase.execute({
      job: claimedJobFixture,
      markdownChunkPlan: createChunkReplacementPlanFixture(),
      chunkEmbeddings: [[1, 2]],
      now: new Date(),
    }),
    relationError,
  )
  assert.deepEqual(chunkReplacementScenario.events, [
    'transaction-open',
    'lock-document',
    'lock-membership',
    'lock-job',
    'lock-index',
    'delete-chunks',
    'save-chunks',
    'delete-relations',
    'transaction-error',
  ])
})

test('replacement snapshots chunk, vector, relation and creation time before awaiting locks', async () => {
  const markdownChunkPlan = createChunkReplacementPlanFixture()
  const chunkEmbeddings = [[1, 2]]
  const replacementCreatedAt = new Date('2026-10-15T00:00:00.000Z')
  const chunkReplacementScenario = createChunkReplacementScenario({
    lockJob: async () => {
      const chunk = markdownChunkPlan.chunks[0]!
      chunk.content = 'Changed body'
      chunk.headingPath.push('Changed')
      markdownChunkPlan.relations[0]!.targetReference = 'Changed.md'
      markdownChunkPlan.relations[0]!.evidenceText = 'Changed evidence'
      chunkEmbeddings[0]![0] = 99
      replacementCreatedAt.setUTCFullYear(2030)

      return createReplacementJobLeaseFixture()
    },
  })

  await chunkReplacementScenario.useCase.execute({
    job: claimedJobFixture,
    markdownChunkPlan,
    chunkEmbeddings,
    now: replacementCreatedAt,
  })
  assert.match(
    chunkReplacementScenario.savedChunks[0]?.id ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  assert.deepEqual(chunkReplacementScenario.savedChunks, [
    {
      id: chunkReplacementScenario.savedChunks[0]?.id,
      documentIndexId: claimedJobFixture.documentIndexId,
      ordinal: 0,
      content: 'Original body',
      headingPath: ['Original'],
      blockStart: 0,
      blockEnd: 2,
      tokenCount: 4,
      embedding: [1, 2],
      createdAt: new Date('2026-10-15T00:00:00.000Z'),
    },
  ])
  assert.match(
    chunkReplacementScenario.savedRelations[0]?.id ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  assert.deepEqual(
    chunkReplacementScenario.savedRelations,
    createChunkReplacementPlanFixture().relations.map((relation, index) => ({
      id: chunkReplacementScenario.savedRelations[index]?.id,
      sourceIndexId: claimedJobFixture.documentIndexId,
      targetDocumentId: null,
      ...relation,
    })),
  )
  assert.notEqual(chunkReplacementScenario.savedChunks[0]!.headingPath, markdownChunkPlan.chunks[0]!.headingPath)
  assert.notEqual(chunkReplacementScenario.savedChunks[0]!.embedding, chunkEmbeddings[0])
  assert.notEqual(chunkReplacementScenario.savedChunks[0]!.createdAt, replacementCreatedAt)
  assert.notEqual(chunkReplacementScenario.savedRelations[0], markdownChunkPlan.relations[0])
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
        const chunkReplacementScenario = createChunkReplacementScenario()
        await assert.rejects(
          chunkReplacementScenario.useCase.execute({
            job: claimedJobFixture,
            markdownChunkPlan: createChunkReplacementPlanFixture(),
            chunkEmbeddings: vectors,
            now: new Date(),
          }),
          exception,
        )
        assert.deepEqual(chunkReplacementScenario.events, [])
      }),
    ),
  )
  await t.test('fractional block offset', async () => {
    const chunkReplacementScenario = createChunkReplacementScenario()
    const plan = createChunkReplacementPlanFixture()
    plan.chunks[0]!.blockStart = 0.5
    await assert.rejects(
      chunkReplacementScenario.useCase.execute({
        job: claimedJobFixture,
        markdownChunkPlan: plan,
        chunkEmbeddings: [[1]],
        now: new Date(),
      }),
      InvalidChunkBlockStartException,
    )
    assert.deepEqual(chunkReplacementScenario.events, [])
  })
  await t.test('negative token count', async () => {
    const chunkReplacementScenario = createChunkReplacementScenario()
    const plan = createChunkReplacementPlanFixture()
    plan.chunks[0]!.tokenCount = -1
    await assert.rejects(
      chunkReplacementScenario.useCase.execute({
        job: claimedJobFixture,
        markdownChunkPlan: plan,
        chunkEmbeddings: [[1]],
        now: new Date(),
      }),
      InvalidChunkTokenCountException,
    )
    assert.deepEqual(chunkReplacementScenario.events, [])
  })
  await t.test('invalid replacement timestamp', async () => {
    const chunkReplacementScenario = createChunkReplacementScenario()
    await assert.rejects(
      chunkReplacementScenario.useCase.execute({
        job: claimedJobFixture,
        markdownChunkPlan: createChunkReplacementPlanFixture(),
        chunkEmbeddings: [[1]],
        now: new Date(NaN),
      }),
      InvalidChunkReplacementTimestampException,
    )
    assert.deepEqual(chunkReplacementScenario.events, [])
  })
})

test('missing or sparse replacement inputs fail before locks or destructive writes', async (context) => {
  const validInput = {
    job: claimedJobFixture,
    markdownChunkPlan: createChunkReplacementPlanFixture(),
    chunkEmbeddings: [[1]],
    now: new Date(),
  }
  const scenarios = [
    { name: 'missing input', input: undefined, exception: ChunkDocumentIndexRequiredException },
    {
      name: 'missing index with empty plan',
      input: {
        ...validInput,
        job: { ...claimedJobFixture, documentIndexId: undefined },
        markdownChunkPlan: { chunks: [], relations: [] },
        chunkEmbeddings: [],
      },
      exception: ChunkDocumentIndexRequiredException,
    },
    {
      name: 'missing plan',
      input: { ...validInput, markdownChunkPlan: undefined },
      exception: ChunkPlanningUnavailableException,
    },
    {
      name: 'sparse plan',
      input: { ...validInput, markdownChunkPlan: { chunks: new Array(1), relations: [] } },
      exception: ChunkPlanningUnavailableException,
    },
    {
      name: 'sparse heading',
      input: {
        ...validInput,
        markdownChunkPlan: {
          chunks: [{ ...validInput.markdownChunkPlan.chunks[0], headingPath: new Array(1) }],
          relations: [],
        },
      },
      exception: ChunkPlanningUnavailableException,
    },
    {
      name: 'missing vectors',
      input: { ...validInput, chunkEmbeddings: undefined },
      exception: KnowledgeEmbeddingUnavailableException,
    },
    {
      name: 'sparse vectors',
      input: { ...validInput, chunkEmbeddings: new Array(1) },
      exception: KnowledgeEmbeddingUnavailableException,
    },
    {
      name: 'sparse vector coordinates',
      input: { ...validInput, chunkEmbeddings: [new Array(1)] },
      exception: KnowledgeEmbeddingUnavailableException,
    },
  ]
  await Promise.all(
    scenarios.map(({ name, input, exception }) =>
      context.test(name, async () => {
        const scenario = createChunkReplacementScenario()
        await assert.rejects(scenario.useCase.execute(input as ReplaceIndexChunkInputDto), exception)
        assert.deepEqual(scenario.events, [])
      }),
    ),
  )
})
