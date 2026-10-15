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
import { InvalidChunkReplacementTimestampException } from '../../../src/Application/Chunks/Exceptions/invalid-chunk-replacement-timestamp.exception.ts'
import type { SaveChunksQueryObject } from '../../../src/Application/Chunks/QueryObjects/save-chunks.query-object.ts'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/Chunks/UseCases/replace-index-chunk.use-case.ts'
import type { IndexJobLeaseFact } from '../../../src/Application/DocumentIndexes/DataTransferObjects/index-job-claim.dto.ts'
import type { ClaimedIndexJobDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/index-job.dto.ts'
import { IndexJobExecutionStageEnum } from '../../../src/Application/DocumentIndexes/Enums/index-job-execution-stage.enum.ts'
import { InvalidIndexJobLeaseException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-index-job-lease.exception.ts'
import { INDEX_JOB_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/index-job-lifecycle.helper.ts'
import { PrepareChunkReplacementUseCase } from '../../../src/Application/DocumentIndexes/UseCases/prepare-chunk-replacement.use-case.ts'
import type { PlannedDocumentRelation } from '../../../src/Application/DocumentRelations/DataTransferObjects/planned-document-relation.dto.ts'
import { ReplacePlannedDocumentRelationsUseCase } from '../../../src/Application/DocumentRelations/UseCases/replace-planned-document-relations.use-case.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Application/KnowledgeBases/Exceptions/knowledge-embedding-unavailable.exception.ts'
import { ReserveMembershipForIndexingUseCase } from '../../../src/Application/Memberships/UseCases/reserve-membership-for-indexing.use-case.ts'
import { InvalidChunkBlockStartException } from '../../../src/Domain/Chunk/Exceptions/invalid-chunk-block-start.exception.ts'
import { InvalidChunkTokenCountException } from '../../../src/Domain/Chunk/Exceptions/invalid-chunk-token-count.exception.ts'
import { DocumentIndex } from '../../../src/Domain/DocumentIndex/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'

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

const createReplacementIndexJobLeaseFixture = (): IndexJobLeaseFact => ({
  id: claimedIndexJobFixture.id,
  knowledgeBaseId: claimedIndexJobFixture.knowledgeBaseId,
  documentId: claimedIndexJobFixture.documentId,
  documentIndexId: claimedIndexJobFixture.documentIndexId,
  generation: claimedIndexJobFixture.generation,
  attempts: claimedIndexJobFixture.attempts,
  status: INDEX_JOB_STATUS.RUNNING,
  leaseToken: claimedIndexJobFixture.leaseToken,
  leaseExpiresAt: new Date(Date.now() + 60_000),
})

interface ChunkReplacementScenario {
  lockDocument(): Promise<boolean>
  lockByKnowledgeBaseIdAndDocumentId(): Promise<{ requestedGeneration: number } | null>
  lockJob(): Promise<IndexJobLeaseFact | null>
  lockDocumentIndex(): Promise<DocumentIndex | null>
  deleteChunksForIndex(): Promise<void>
  deleteRelationsForIndex(): Promise<void>
  saveChunks(replacementChunksQO: SaveChunksQueryObject['chunks']): Promise<void>
  saveRelations(plannedRelationsDTO: readonly PlannedDocumentRelation[]): Promise<void>
}

const createChunkReplacementScenario = (scenarioOverrides: Partial<ChunkReplacementScenario> = {}) => {
  const events: string[] = []
  const savedChunks: SaveChunksQueryObject['chunks'][number][] = []
  const savedRelations: PlannedDocumentRelation[] = []
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

      return createReplacementIndexJobLeaseFixture()
    },
    lockDocumentIndex: async () => {
      events.push('lock-index')

      return new DocumentIndex({
        id: claimedIndexJobFixture.documentIndexId,
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
    saveRelations: async (plannedRelationsDTO) => {
      events.push('save-relations')
      savedRelations.push(...plannedRelationsDTO)
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
    new PrepareChunkReplacementUseCase(
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
      createRepositoryStub<ConstructorParameters<typeof PrepareChunkReplacementUseCase>[2]>({
        lockById: async () => {
          const lockedJobLease = await chunkReplacementOperations.lockJob()

          return lockedJobLease === null ? null : createIndexJobRecordFixture(lockedJobLease)
        },
      }),
      createRepositoryStub<ConstructorParameters<typeof PrepareChunkReplacementUseCase>[3]>({
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
    fact: IndexJobLeaseFact | null
  }[] = [
    { name: 'missing job', fact: null },
    { name: 'different job', fact: { ...createReplacementIndexJobLeaseFixture(), id: 'job-2' } },
    { name: 'different knowledge base', fact: { ...createReplacementIndexJobLeaseFixture(), knowledgeBaseId: 'kb-2' } },
    { name: 'different document', fact: { ...createReplacementIndexJobLeaseFixture(), documentId: 'doc-2' } },
    { name: 'different index', fact: { ...createReplacementIndexJobLeaseFixture(), documentIndexId: 'index-2' } },
    { name: 'different generation', fact: { ...createReplacementIndexJobLeaseFixture(), generation: '2' } },
    { name: 'different attempt', fact: { ...createReplacementIndexJobLeaseFixture(), attempts: 2 } },
    { name: 'different token', fact: { ...createReplacementIndexJobLeaseFixture(), leaseToken: 'lease-2' } },
    { name: 'missing token', fact: { ...createReplacementIndexJobLeaseFixture(), leaseToken: null } },
    { name: 'queued job', fact: { ...createReplacementIndexJobLeaseFixture(), status: INDEX_JOB_STATUS.QUEUED } },
    { name: 'missing expiration', fact: { ...createReplacementIndexJobLeaseFixture(), leaseExpiresAt: null } },
    {
      name: 'expired lease',
      fact: { ...createReplacementIndexJobLeaseFixture(), leaseExpiresAt: new Date(Date.now() - 1) },
    },
  ]
  const assertRejectedFact = ({ name, fact }: (typeof facts)[number]) =>
    t.test(name, async () => {
      const chunkReplacementScenario = createChunkReplacementScenario({ lockJob: async () => fact })

      await assert.rejects(
        chunkReplacementScenario.useCase.execute({
          indexJob: claimedIndexJobFixture,
          markdownChunkPlan: createChunkReplacementPlanFixture(),
          chunkEmbeddings: [[1, 2]],
          lexicalSearchTexts: ['original'],
          now: new Date(),
        }),
        InvalidIndexJobLeaseException,
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
            indexJob: claimedIndexJobFixture,
            markdownChunkPlan: createChunkReplacementPlanFixture(),
            chunkEmbeddings: [[1, 2]],
            lexicalSearchTexts: ['original'],
            now: new Date(),
          }),
          InvalidIndexJobLeaseException,
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
      new DocumentIndex({
        id: claimedIndexJobFixture.documentIndexId,
        status: DocumentIndexStatusEnum.READY,
        readyAt: new Date(),
        unreferencedSince: null,
      }),
  })

  await chunkReplacementScenario.useCase.execute({
    indexJob: claimedIndexJobFixture,
    markdownChunkPlan: createChunkReplacementPlanFixture(),
    chunkEmbeddings: [[1, 2]],
    lexicalSearchTexts: ['original'],
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
      indexJob: claimedIndexJobFixture,
      markdownChunkPlan: createChunkReplacementPlanFixture(),
      chunkEmbeddings: [[1, 2]],
      lexicalSearchTexts: ['original'],
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

test('replacement snapshots chunk, vector, relation, lexical and creation time before awaiting locks', async () => {
  const markdownChunkPlan = createChunkReplacementPlanFixture()
  const chunkEmbeddings = [[1, 2]]
  const lexicalSearchTexts = ['original']
  const replacementCreatedAt = new Date('2026-10-15T00:00:00.000Z')
  const chunkReplacementScenario = createChunkReplacementScenario({
    lockJob: async () => {
      const chunk = markdownChunkPlan.chunks[0]!
      chunk.content = 'Changed body'
      chunk.headingPath.push('Changed')
      markdownChunkPlan.relations[0]!.targetReference = 'Changed.md'
      markdownChunkPlan.relations[0]!.evidenceText = 'Changed evidence'
      chunkEmbeddings[0]![0] = 99
      lexicalSearchTexts[0] = 'changed'
      replacementCreatedAt.setUTCFullYear(2030)

      return createReplacementIndexJobLeaseFixture()
    },
  })

  await chunkReplacementScenario.useCase.execute({
    indexJob: claimedIndexJobFixture,
    markdownChunkPlan,
    chunkEmbeddings,
    lexicalSearchTexts,
    now: replacementCreatedAt,
  })
  assert.match(
    chunkReplacementScenario.savedChunks[0]?.id ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  assert.deepEqual(chunkReplacementScenario.savedChunks, [
    {
      id: chunkReplacementScenario.savedChunks[0]?.id,
      documentIndexId: claimedIndexJobFixture.documentIndexId,
      ordinal: 0,
      content: 'Original body',
      headingPath: ['Original'],
      blockStart: 0,
      blockEnd: 2,
      tokenCount: 4,
      embedding: [1, 2],
      searchVector: 'original',
      createdAt: new Date('2026-10-15T00:00:00.000Z'),
    },
  ])
  assert.deepEqual(
    chunkReplacementScenario.savedRelations,
    createChunkReplacementPlanFixture().relations.map((relation) => ({
      sourceIndexId: claimedIndexJobFixture.documentIndexId,
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
            indexJob: claimedIndexJobFixture,
            markdownChunkPlan: createChunkReplacementPlanFixture(),
            chunkEmbeddings: vectors,
            lexicalSearchTexts: ['original'],
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
        indexJob: claimedIndexJobFixture,
        markdownChunkPlan: plan,
        chunkEmbeddings: [[1]],
        lexicalSearchTexts: ['original'],
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
        indexJob: claimedIndexJobFixture,
        markdownChunkPlan: plan,
        chunkEmbeddings: [[1]],
        lexicalSearchTexts: ['original'],
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
        indexJob: claimedIndexJobFixture,
        markdownChunkPlan: createChunkReplacementPlanFixture(),
        chunkEmbeddings: [[1]],
        lexicalSearchTexts: ['original'],
        now: new Date(NaN),
      }),
      InvalidChunkReplacementTimestampException,
    )
    assert.deepEqual(chunkReplacementScenario.events, [])
  })
})
