type KnowledgeBaseDocumentPruneJobDTO = {
  id: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
}

type KnowledgeBaseDocumentPruneRecordDTO = {
  knowledgeBaseId: string
  documentId: string
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'

import {
  createDocumentFixture,
  createRestoredKnowledgeBaseDocumentFixture,
  createRestoredDocumentIndexFixture,
  createJobRecordFixture,
  createRepositoryStub,
} from './document-index-lifecycle.fixture.ts'
import {
  createKnowledgeBaseDocumentPruningUseCase,
  type KnowledgeBaseDocumentPruningTestDependencies,
} from './document-retention-use-cases.fixture.ts'
import type { PruneKnowledgeBaseDocumentsUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/prune-knowledge-base-documents.use-case.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { KnowledgeBase } from '../../../src/Domain/KnowledgeBase/knowledge-base.ts'
import { KnowledgeBaseDocumentPruneConflictException } from '../../../src/Domain/KnowledgeBaseDocument/Exceptions/knowledge-base-document-prune-conflict.exception.ts'
import { KnowledgeBaseDocument } from '../../../src/Domain/KnowledgeBaseDocument/knowledge-base-document.ts'

class KnowledgeBaseDocumentPruningTestScenario {
  private transactionActive = false

  private pendingOperation: string | null = null

  private readonly jobs = new Map<string, KnowledgeBaseDocumentPruneJobDTO>()

  constructor(
    private readonly candidate: KnowledgeBaseDocumentPruneRecordDTO,
    private readonly calls: string[],
    private readonly knowledgeBaseDocumentRemovalResult = true,
    private currentActiveIndexId: string | null = 'active-index',
    private readonly knowledgeBaseDocumentLockResult = true,
    private readonly cancelledIndexIds: string[] = [],
    private readonly knowledgeBaseDocumentReferenceCount = 0,
    private readonly jobReferenceCount = 0,
    private readonly projectMatches = true,
    private readonly additionalCandidates: readonly KnowledgeBaseDocumentPruneRecordDTO[] = [],
    private readonly lockedJobOverrides: Partial<KnowledgeBaseDocumentPruneJobDTO> = {},
  ) {}

  createUseCase(): PruneKnowledgeBaseDocumentsUseCase {
    return createKnowledgeBaseDocumentPruningUseCase(
      {
        run: async (operation) => {
          assert.equal(this.transactionActive, false)
          this.transactionActive = true
          try {
            return await operation()
          } finally {
            this.transactionActive = false
          }
        },
        runReadOnlySnapshot: async () => assert.fail('pruning knowledgeBaseDocuments uses a write transaction'),
      },
      createRepositoryStub<KnowledgeBaseDocumentPruningTestDependencies[1]>({
        findByKnowledgeBaseIdAndProjectId: async ({ knowledgeBaseId, projectId }) => {
          this.calls.push(`project:${projectId}:${knowledgeBaseId}`)

          if (!this.projectMatches) return null

          return KnowledgeBase.create({
            id: knowledgeBaseId,
            projectId,
            projectName: 'project',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        },
      }),
      createRepositoryStub<KnowledgeBaseDocumentPruningTestDependencies[2]>({
        findByDocumentId: async ({ documentId }) => createDocumentFixture({ id: documentId }),
        lockByDocumentId: async ({ documentId }) => {
          await this.completeOperation('lock-document')
          this.calls.push('lock-document')

          return createDocumentFixture({ id: documentId })
        },
        updateUnreferencedSinceByDocumentIdAndUnreferencedSinceIsNull: async (markDocumentUnreferencedQO) => {
          const { unreferencedSince } = markDocumentUnreferencedQO

          await this.completeOperation('mark-document-unreferenced')
          this.calls.push(`mark-document-unreferenced:${unreferencedSince.toISOString()}`)
        },
      }),
      createRepositoryStub<KnowledgeBaseDocumentPruningTestDependencies[3]>({
        findByKnowledgeBaseIdOrderByDocumentIdAsc: async (knowledgeBaseDocumentKnowledgeBaseQO) => {
          const { knowledgeBaseId } = knowledgeBaseDocumentKnowledgeBaseQO

          this.calls.push(`find:${knowledgeBaseId}`)

          return [this.candidate, ...this.additionalCandidates].map((candidate) =>
            createRestoredKnowledgeBaseDocumentFixture(candidate),
          )
        },
        lockByKnowledgeBaseIdAndDocumentId: async (knowledgeBaseDocumentSourceQO) => {
          const { knowledgeBaseId, documentId } = knowledgeBaseDocumentSourceQO

          await this.completeOperation('lock-knowledgeBaseDocument')
          this.calls.push(`lock-knowledgeBaseDocument:${knowledgeBaseId}:${documentId}`)

          return this.knowledgeBaseDocumentLockResult
            ? createRestoredKnowledgeBaseDocumentFixture({
                knowledgeBaseId,
                documentId,
                activeDocumentIndexId: this.currentActiveIndexId,
              })
            : null
        },
        updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId: async (updateKnowledgeBaseDocumentQO) => {
          const { knowledgeBaseId, documentId, activeDocumentIndexId } = updateKnowledgeBaseDocumentQO

          await this.completeOperation('clear-active-index')
          this.calls.push(`clear-active-index:${knowledgeBaseId}:${documentId}:${this.currentActiveIndexId ?? 'null'}`)
          this.currentActiveIndexId = activeDocumentIndexId ?? null
        },
        removeByKnowledgeBaseIdAndDocumentId: async (knowledgeBaseDocumentSourceQO) => {
          const { knowledgeBaseId, documentId } = knowledgeBaseDocumentSourceQO

          await this.completeOperation('remove-knowledgeBaseDocument')
          this.calls.push(`remove-knowledgeBaseDocument:${knowledgeBaseId}:${documentId}`)

          if (!this.knowledgeBaseDocumentRemovalResult)
            throw new KnowledgeBaseDocumentPruneConflictException(knowledgeBaseId, documentId)
        },
        findByActiveDocumentIndexId: async ({ documentIndexId }) =>
          this.knowledgeBaseDocumentReferenceCount > 0
            ? createRestoredKnowledgeBaseDocumentFixture({
                knowledgeBaseId: 'other-kb',
                activeDocumentIndexId: documentIndexId,
              })
            : null,
        findByDocumentId: async () => null,
      }),
      createRepositoryStub<KnowledgeBaseDocumentPruningTestDependencies[4]>({
        findKnowledgeBaseDocumentExecutions: async (jobsForTargetQO) => {
          assert.equal(
            this.transactionActive,
            true,
            'cancellation stays in the knowledgeBaseDocument pruning transaction',
          )
          const { knowledgeBaseId, documentId } = jobsForTargetQO

          await this.completeOperation('find-jobs')
          this.calls.push(`find-jobs:${knowledgeBaseId}:${documentId}`)
          const jobs = this.cancelledIndexIds.map((documentIndexId, sequence) =>
            createJobRecordFixture({
              id: `${documentId}:${documentIndexId}:${sequence}`,
              knowledgeBaseId,
              documentId,
              documentIndexId,
            }),
          )
          jobs.forEach((job) => this.jobs.set(job.id, job))

          return jobs
        },
        lockExecution: async (jobIdQO) => {
          assert.equal(
            this.transactionActive,
            true,
            'cancellation stays in the knowledgeBaseDocument pruning transaction',
          )
          const { jobId } = jobIdQO

          await this.completeOperation('lock-job')
          this.calls.push(`lock-job:${jobId}`)
          const job = this.jobs.get(jobId)

          return job ? createJobRecordFixture({ ...job, ...this.lockedJobOverrides }) : null
        },
        releaseExecution: async (jobIdQO) => {
          assert.equal(
            this.transactionActive,
            true,
            'cancellation stays in the knowledgeBaseDocument pruning transaction',
          )
          const { jobId } = jobIdQO

          await this.completeOperation('remove-job')
          this.calls.push(`remove-job:${jobId}`)
          this.jobs.delete(jobId)
        },
        countIndexExecutions: async () => this.jobReferenceCount,
        countDocumentExecutions: async () => 0,
      }),
      createRepositoryStub<KnowledgeBaseDocumentPruningTestDependencies[5]>({
        lockByDocumentIndexId: async (documentIndexIdQO) => {
          const { documentIndexId } = documentIndexIdQO

          await this.completeOperation('lock-index')
          this.calls.push(`lock-index:${documentIndexId}`)

          return createRestoredDocumentIndexFixture({ id: documentIndexId })
        },
        updateByDocumentIndexIdWithLifecycleFields: async (saveDocumentIndexLifecycleQO) => {
          const { documentIndexId, status, readyAt, unreferencedSince } = saveDocumentIndexLifecycleQO

          await this.completeOperation('mark-index-unreferenced')
          assert.equal(status, DocumentIndexStatusEnum.BUILDING)
          assert.equal(readyAt, null)
          assert.ok(unreferencedSince)
          this.calls.push(`mark-index-unreferenced:${documentIndexId}:${unreferencedSince.toISOString()}`)
        },
        findByDocumentId: async () => [],
      }),
      createRepositoryStub<KnowledgeBaseDocumentPruningTestDependencies[6]>({
        findByDocumentIdOrderByCreatedAtDesc: async () => null,
      }),
      createRepositoryStub<KnowledgeBaseDocumentPruningTestDependencies[7]>({
        countDocumentFailures: async () => 0,
      }),
      createRepositoryStub<KnowledgeBaseDocumentPruningTestDependencies[8]>({
        findByTargetDocumentId: async () => null,
      }),
    )
  }

  private async completeOperation(operation: string): Promise<void> {
    assert.equal(this.pendingOperation, null, `${operation} started before ${this.pendingOperation} completed`)
    this.pendingOperation = operation
    await setImmediate()
    this.pendingOperation = null
  }
}

const createPruneKnowledgeBaseDocumentsScenario = (scenario: KnowledgeBaseDocumentPruningTestScenario) =>
  scenario.createUseCase()

const createKnowledgeBaseDocumentPruneCandidateFixture: KnowledgeBaseDocumentPruneRecordDTO = {
  knowledgeBaseId: 'kb',
  documentId: 'document',
}

test('prunes a knowledgeBaseDocument and starts retention after removing its references', async () => {
  const calls: string[] = []
  const useCase = createPruneKnowledgeBaseDocumentsScenario(
    new KnowledgeBaseDocumentPruningTestScenario(createKnowledgeBaseDocumentPruneCandidateFixture, calls),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.equal(result.length, 1)
  assert.ok(result[0] instanceof KnowledgeBaseDocument)
  assert.equal(result[0].knowledgeBaseId, 'kb')
  assert.equal(result[0].documentId, 'document')
  const callsWithoutTimestamps = calls.map((call) => call.replace(/:\d{4}-\d{2}-\d{2}T.*$/, ':<timestamp>'))
  assert.deepEqual(callsWithoutTimestamps, [
    'project:project:kb',
    'find:kb',
    'lock-document',
    'lock-knowledgeBaseDocument:kb:document',
    'find-jobs:kb:document',
    'clear-active-index:kb:document:active-index',
    'remove-knowledgeBaseDocument:kb:document',
    'lock-index:active-index',
    'mark-index-unreferenced:active-index:<timestamp>',
    'mark-document-unreferenced:<timestamp>',
  ])
  const indexUnreferencedAt = calls
    .find((call) => call.startsWith('mark-index-unreferenced:'))
    ?.slice('mark-index-unreferenced:active-index:'.length)
  const documentUnreferencedAt = calls.at(-1)?.slice('mark-document-unreferenced:'.length)
  assert.ok(indexUnreferencedAt)
  assert.equal(documentUnreferencedAt, indexUnreferencedAt)
})

test('propagates a knowledgeBaseDocument delete conflict so the transaction can roll back', async () => {
  const calls: string[] = []
  const useCase = createPruneKnowledgeBaseDocumentsScenario(
    new KnowledgeBaseDocumentPruningTestScenario(createKnowledgeBaseDocumentPruneCandidateFixture, calls, false),
  )

  await assert.rejects(
    useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] }),
    KnowledgeBaseDocumentPruneConflictException,
  )

  assert.deepEqual(
    calls.map((call) => call.replace(/:\d{4}-\d{2}-\d{2}T.*$/, ':<timestamp>')),
    [
      'project:project:kb',
      'find:kb',
      'lock-document',
      'lock-knowledgeBaseDocument:kb:document',
      'find-jobs:kb:document',
      'clear-active-index:kb:document:active-index',
      'remove-knowledgeBaseDocument:kb:document',
    ],
  )
})

test('uses the knowledgeBaseDocument lock reread instead of stale candidate fields before clearing its active index', async () => {
  const calls: string[] = []
  const staleCandidate = { knowledgeBaseId: 'kb', documentId: 'document' }
  const useCase = createPruneKnowledgeBaseDocumentsScenario(
    new KnowledgeBaseDocumentPruningTestScenario(staleCandidate, calls),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.equal(result.length, 1)
  assert.ok(result[0] instanceof KnowledgeBaseDocument)
  assert.equal(result[0].knowledgeBaseId, 'kb')
  assert.equal(result[0].documentId, 'document')
  assert.ok(calls.includes('clear-active-index:kb:document:active-index'))
})

test('filters retained documents in the use case before taking locks', async () => {
  const calls: string[] = []
  const useCase = createPruneKnowledgeBaseDocumentsScenario(
    new KnowledgeBaseDocumentPruningTestScenario(createKnowledgeBaseDocumentPruneCandidateFixture, calls),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: ['document'] })

  assert.deepEqual(result, [])
  assert.deepEqual(calls, ['project:project:kb', 'find:kb'])
})

test('skips a knowledgeBaseDocument that disappeared before the locked reread', async () => {
  const calls: string[] = []
  const useCase = createPruneKnowledgeBaseDocumentsScenario(
    new KnowledgeBaseDocumentPruningTestScenario(
      createKnowledgeBaseDocumentPruneCandidateFixture,
      calls,
      true,
      'active-index',
      false,
    ),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.deepEqual(result, [])
  assert.deepEqual(calls, ['project:project:kb', 'find:kb', 'lock-document', 'lock-knowledgeBaseDocument:kb:document'])
})

test('does not mark an absent active index as unreferenced', async () => {
  const calls: string[] = []
  const useCase = createPruneKnowledgeBaseDocumentsScenario(
    new KnowledgeBaseDocumentPruningTestScenario(createKnowledgeBaseDocumentPruneCandidateFixture, calls, true, null),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.equal(result.length, 1)
  assert.ok(result[0] instanceof KnowledgeBaseDocument)
  assert.equal(result[0].knowledgeBaseId, 'kb')
  assert.equal(result[0].documentId, 'document')
  assert.ok(!calls.some((call) => call.startsWith('mark-index-unreferenced:')))
})

test('preserves a shared active index referenced by another knowledgeBaseDocument', async () => {
  const calls: string[] = []
  const useCase = createPruneKnowledgeBaseDocumentsScenario(
    new KnowledgeBaseDocumentPruningTestScenario(
      createKnowledgeBaseDocumentPruneCandidateFixture,
      calls,
      true,
      'shared-index',
      true,
      [],
      1,
    ),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.equal(result.length, 1)
  assert.ok(result[0] instanceof KnowledgeBaseDocument)
  assert.equal(result[0].activeDocumentIndexId, 'shared-index')
  assert.ok(calls.includes('lock-index:shared-index'))
  assert.ok(!calls.some((call) => call.startsWith('mark-index-unreferenced:')))
})

test('preserves an index referenced by a job in another knowledge base', async () => {
  const calls: string[] = []
  const useCase = createPruneKnowledgeBaseDocumentsScenario(
    new KnowledgeBaseDocumentPruningTestScenario(
      createKnowledgeBaseDocumentPruneCandidateFixture,
      calls,
      true,
      'shared-index',
      true,
      [],
      0,
      1,
    ),
  )

  await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.ok(!calls.some((call) => call.startsWith('mark-index-unreferenced:')))
})

test('starts retention for cancelled job outputs even when the knowledgeBaseDocument had no active index', async () => {
  const calls: string[] = []
  const useCase = createPruneKnowledgeBaseDocumentsScenario(
    new KnowledgeBaseDocumentPruningTestScenario(
      createKnowledgeBaseDocumentPruneCandidateFixture,
      calls,
      true,
      null,
      true,
      ['building-index', 'building-index'],
    ),
  )

  await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.equal(calls.filter((call) => call === 'lock-index:building-index').length, 1)
  assert.equal(calls.filter((call) => call.startsWith('mark-index-unreferenced:building-index:')).length, 1)
  assert.deepEqual(
    calls.filter((call) => call.startsWith('lock-job:') || call.startsWith('remove-job:')),
    [
      'lock-job:document:building-index:0',
      'remove-job:document:building-index:0',
      'lock-job:document:building-index:1',
      'remove-job:document:building-index:1',
    ],
  )
  assert.ok(
    calls.indexOf('remove-job:document:building-index:1') < calls.indexOf('clear-active-index:kb:document:null'),
  )
})

test('rejects a changed job identity before deleting the job or knowledgeBaseDocument', async () => {
  const calls: string[] = []
  const useCase = createPruneKnowledgeBaseDocumentsScenario(
    new KnowledgeBaseDocumentPruningTestScenario(
      createKnowledgeBaseDocumentPruneCandidateFixture,
      calls,
      true,
      null,
      true,
      ['building-index'],
      0,
      0,
      true,
      [],
      {
        documentId: 'another-document',
      },
    ),
  )

  await assert.rejects(
    useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] }),
    KnowledgeBaseDocumentPruneConflictException,
  )

  assert.equal(calls.at(-1), 'lock-job:document:building-index:0')
  assert.ok(!calls.some((call) => call.startsWith('remove-job:') || call.startsWith('remove-knowledgeBaseDocument:')))
})

test('awaits each pruned knowledgeBaseDocument and detached index in sorted lock order', async () => {
  const calls: string[] = []
  const useCase = createPruneKnowledgeBaseDocumentsScenario(
    new KnowledgeBaseDocumentPruningTestScenario(
      { knowledgeBaseId: 'kb', documentId: 'z-document' },
      calls,
      true,
      'z-index',
      true,
      ['z-index', 'a-index', 'a-index'],
      0,
      0,
      true,
      [{ knowledgeBaseId: 'kb', documentId: 'a-document' }],
    ),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.ok(result.every((knowledgeBaseDocument) => knowledgeBaseDocument instanceof KnowledgeBaseDocument))
  assert.deepEqual(
    result.map((knowledgeBaseDocument) => knowledgeBaseDocument.documentId),
    ['a-document', 'z-document'],
  )
  assert.deepEqual(
    calls.filter((call) => call.startsWith('lock-knowledgeBaseDocument:')),
    ['lock-knowledgeBaseDocument:kb:a-document', 'lock-knowledgeBaseDocument:kb:z-document'],
  )
  assert.deepEqual(
    calls.filter((call) => call.startsWith('lock-index:')),
    ['lock-index:a-index', 'lock-index:z-index', 'lock-index:a-index', 'lock-index:z-index'],
  )
  assert.deepEqual(calls.slice(2, 4), ['lock-document', 'lock-document'])
  assert.equal(calls[4], 'lock-knowledgeBaseDocument:kb:a-document')
  assert.deepEqual(
    calls.filter((call) => call.startsWith('lock-job:a-document:')),
    ['lock-job:a-document:a-index:1', 'lock-job:a-document:a-index:2', 'lock-job:a-document:z-index:0'],
  )
  const firstDocumentRetention = calls.findIndex((call) => call.startsWith('mark-document-unreferenced:'))
  assert.ok(firstDocumentRetention < calls.indexOf('lock-knowledgeBaseDocument:kb:z-document'))
})

test('leaves knowledgeBaseDocuments untouched when the knowledge base is outside the project', async () => {
  const calls: string[] = []
  const useCase = createPruneKnowledgeBaseDocumentsScenario(
    new KnowledgeBaseDocumentPruningTestScenario(
      createKnowledgeBaseDocumentPruneCandidateFixture,
      calls,
      true,
      'active-index',
      true,
      [],
      0,
      0,
      false,
    ),
  )

  assert.deepEqual(await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] }), [])
  assert.deepEqual(calls, ['project:project:kb'])
})
