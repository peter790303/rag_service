type MembershipPruneJobDto = {
  id: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
}

type MembershipPruneRecordDto = {
  knowledgeBaseId: string
  documentId: string
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'

import {
  createDocumentFixture,
  createRestoredMembershipFixture,
  createRestoredDocumentIndexFixture,
  createJobRecordFixture,
  createRepositoryStub,
} from './document-index-lifecycle.fixture.ts'
import {
  createMembershipPruningUseCase,
  type MembershipPruningTestDependencies,
} from './document-retention-use-cases.fixture.ts'
import type { PruneKnowledgeBaseMembershipsUseCase } from '../../../src/Application/Memberships/UseCases/prune-knowledge-base-memberships.use-case.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { KnowledgeBase } from '../../../src/Domain/KnowledgeBase/knowledge-base.ts'
import { KnowledgeMembershipPruneConflictException } from '../../../src/Domain/Membership/Exceptions/knowledge-membership-prune-conflict.exception.ts'
import { Membership } from '../../../src/Domain/Membership/membership.ts'

class MembershipPruningTestScenario {
  private transactionActive = false

  private pendingOperation: string | null = null

  private readonly jobs = new Map<string, MembershipPruneJobDto>()

  constructor(
    private readonly candidate: MembershipPruneRecordDto,
    private readonly calls: string[],
    private readonly membershipRemovalResult = true,
    private currentActiveIndexId: string | null = 'active-index',
    private readonly membershipLockResult = true,
    private readonly cancelledIndexIds: string[] = [],
    private readonly membershipReferenceCount = 0,
    private readonly jobReferenceCount = 0,
    private readonly projectMatches = true,
    private readonly additionalCandidates: readonly MembershipPruneRecordDto[] = [],
    private readonly lockedJobOverrides: Partial<MembershipPruneJobDto> = {},
  ) {}

  createUseCase(): PruneKnowledgeBaseMembershipsUseCase {
    return createMembershipPruningUseCase(
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
        runReadOnlySnapshot: async () => assert.fail('pruning memberships uses a write transaction'),
      },
      createRepositoryStub<MembershipPruningTestDependencies[1]>({
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
      createRepositoryStub<MembershipPruningTestDependencies[2]>({
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
      createRepositoryStub<MembershipPruningTestDependencies[3]>({
        findByKnowledgeBaseIdOrderByDocumentIdAsc: async (membershipKnowledgeBaseQO) => {
          const { knowledgeBaseId } = membershipKnowledgeBaseQO

          this.calls.push(`find:${knowledgeBaseId}`)

          return [this.candidate, ...this.additionalCandidates].map((candidate) =>
            createRestoredMembershipFixture(candidate),
          )
        },
        lockByKnowledgeBaseIdAndDocumentId: async (membershipSourceQO) => {
          const { knowledgeBaseId, documentId } = membershipSourceQO

          await this.completeOperation('lock-membership')
          this.calls.push(`lock-membership:${knowledgeBaseId}:${documentId}`)

          return this.membershipLockResult
            ? createRestoredMembershipFixture({
                knowledgeBaseId,
                documentId,
                activeDocumentIndexId: this.currentActiveIndexId,
              })
            : null
        },
        updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId: async (updateMembershipQO) => {
          const { knowledgeBaseId, documentId, activeDocumentIndexId } = updateMembershipQO

          await this.completeOperation('clear-active-index')
          this.calls.push(`clear-active-index:${knowledgeBaseId}:${documentId}:${this.currentActiveIndexId ?? 'null'}`)
          this.currentActiveIndexId = activeDocumentIndexId ?? null
        },
        removeByKnowledgeBaseIdAndDocumentId: async (membershipSourceQO) => {
          const { knowledgeBaseId, documentId } = membershipSourceQO

          await this.completeOperation('remove-membership')
          this.calls.push(`remove-membership:${knowledgeBaseId}:${documentId}`)

          if (!this.membershipRemovalResult)
            throw new KnowledgeMembershipPruneConflictException(knowledgeBaseId, documentId)
        },
        findByActiveDocumentIndexId: async ({ documentIndexId }) =>
          this.membershipReferenceCount > 0
            ? createRestoredMembershipFixture({ knowledgeBaseId: 'other-kb', activeDocumentIndexId: documentIndexId })
            : null,
        findByDocumentId: async () => null,
      }),
      createRepositoryStub<MembershipPruningTestDependencies[4]>({
        findMembershipExecutions: async (jobsForTargetQO) => {
          assert.equal(this.transactionActive, true, 'cancellation stays in the membership pruning transaction')
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
          assert.equal(this.transactionActive, true, 'cancellation stays in the membership pruning transaction')
          const { jobId } = jobIdQO

          await this.completeOperation('lock-job')
          this.calls.push(`lock-job:${jobId}`)
          const job = this.jobs.get(jobId)

          return job ? createJobRecordFixture({ ...job, ...this.lockedJobOverrides }) : null
        },
        releaseExecution: async (jobIdQO) => {
          assert.equal(this.transactionActive, true, 'cancellation stays in the membership pruning transaction')
          const { jobId } = jobIdQO

          await this.completeOperation('remove-job')
          this.calls.push(`remove-job:${jobId}`)
          this.jobs.delete(jobId)
        },
        countIndexExecutions: async () => this.jobReferenceCount,
        countDocumentExecutions: async () => 0,
      }),
      createRepositoryStub<MembershipPruningTestDependencies[5]>({
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
      createRepositoryStub<MembershipPruningTestDependencies[6]>({
        findByDocumentIdOrderByCreatedAtDesc: async () => null,
      }),
      createRepositoryStub<MembershipPruningTestDependencies[7]>({
        countDocumentFailures: async () => 0,
      }),
      createRepositoryStub<MembershipPruningTestDependencies[8]>({
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

const createPruneMembershipsScenario = (scenario: MembershipPruningTestScenario) => scenario.createUseCase()

const createMembershipPruneCandidateFixture: MembershipPruneRecordDto = {
  knowledgeBaseId: 'kb',
  documentId: 'document',
}

test('prunes a membership and starts retention after removing its references', async () => {
  const calls: string[] = []
  const useCase = createPruneMembershipsScenario(
    new MembershipPruningTestScenario(createMembershipPruneCandidateFixture, calls),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.equal(result.length, 1)
  assert.ok(result[0] instanceof Membership)
  assert.equal(result[0].knowledgeBaseId, 'kb')
  assert.equal(result[0].documentId, 'document')
  const callsWithoutTimestamps = calls.map((call) => call.replace(/:\d{4}-\d{2}-\d{2}T.*$/, ':<timestamp>'))
  assert.deepEqual(callsWithoutTimestamps, [
    'project:project:kb',
    'find:kb',
    'lock-document',
    'lock-membership:kb:document',
    'find-jobs:kb:document',
    'clear-active-index:kb:document:active-index',
    'remove-membership:kb:document',
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

test('propagates a membership delete conflict so the transaction can roll back', async () => {
  const calls: string[] = []
  const useCase = createPruneMembershipsScenario(
    new MembershipPruningTestScenario(createMembershipPruneCandidateFixture, calls, false),
  )

  await assert.rejects(
    useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] }),
    KnowledgeMembershipPruneConflictException,
  )

  assert.deepEqual(
    calls.map((call) => call.replace(/:\d{4}-\d{2}-\d{2}T.*$/, ':<timestamp>')),
    [
      'project:project:kb',
      'find:kb',
      'lock-document',
      'lock-membership:kb:document',
      'find-jobs:kb:document',
      'clear-active-index:kb:document:active-index',
      'remove-membership:kb:document',
    ],
  )
})

test('uses the membership lock reread instead of stale candidate fields before clearing its active index', async () => {
  const calls: string[] = []
  const staleCandidate = { knowledgeBaseId: 'kb', documentId: 'document' }
  const useCase = createPruneMembershipsScenario(new MembershipPruningTestScenario(staleCandidate, calls))

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.equal(result.length, 1)
  assert.ok(result[0] instanceof Membership)
  assert.equal(result[0].knowledgeBaseId, 'kb')
  assert.equal(result[0].documentId, 'document')
  assert.ok(calls.includes('clear-active-index:kb:document:active-index'))
})

test('filters retained documents in the use case before taking locks', async () => {
  const calls: string[] = []
  const useCase = createPruneMembershipsScenario(
    new MembershipPruningTestScenario(createMembershipPruneCandidateFixture, calls),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: ['document'] })

  assert.deepEqual(result, [])
  assert.deepEqual(calls, ['project:project:kb', 'find:kb'])
})

test('skips a membership that disappeared before the locked reread', async () => {
  const calls: string[] = []
  const useCase = createPruneMembershipsScenario(
    new MembershipPruningTestScenario(createMembershipPruneCandidateFixture, calls, true, 'active-index', false),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.deepEqual(result, [])
  assert.deepEqual(calls, ['project:project:kb', 'find:kb', 'lock-document', 'lock-membership:kb:document'])
})

test('does not mark an absent active index as unreferenced', async () => {
  const calls: string[] = []
  const useCase = createPruneMembershipsScenario(
    new MembershipPruningTestScenario(createMembershipPruneCandidateFixture, calls, true, null),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.equal(result.length, 1)
  assert.ok(result[0] instanceof Membership)
  assert.equal(result[0].knowledgeBaseId, 'kb')
  assert.equal(result[0].documentId, 'document')
  assert.ok(!calls.some((call) => call.startsWith('mark-index-unreferenced:')))
})

test('preserves a shared active index referenced by another membership', async () => {
  const calls: string[] = []
  const useCase = createPruneMembershipsScenario(
    new MembershipPruningTestScenario(createMembershipPruneCandidateFixture, calls, true, 'shared-index', true, [], 1),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.equal(result.length, 1)
  assert.ok(result[0] instanceof Membership)
  assert.equal(result[0].activeDocumentIndexId, 'shared-index')
  assert.ok(calls.includes('lock-index:shared-index'))
  assert.ok(!calls.some((call) => call.startsWith('mark-index-unreferenced:')))
})

test('preserves an index referenced by a job in another knowledge base', async () => {
  const calls: string[] = []
  const useCase = createPruneMembershipsScenario(
    new MembershipPruningTestScenario(
      createMembershipPruneCandidateFixture,
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

test('starts retention for cancelled job outputs even when the membership had no active index', async () => {
  const calls: string[] = []
  const useCase = createPruneMembershipsScenario(
    new MembershipPruningTestScenario(createMembershipPruneCandidateFixture, calls, true, null, true, [
      'building-index',
      'building-index',
    ]),
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

test('rejects a changed job identity before deleting the job or membership', async () => {
  const calls: string[] = []
  const useCase = createPruneMembershipsScenario(
    new MembershipPruningTestScenario(
      createMembershipPruneCandidateFixture,
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
    KnowledgeMembershipPruneConflictException,
  )

  assert.equal(calls.at(-1), 'lock-job:document:building-index:0')
  assert.ok(!calls.some((call) => call.startsWith('remove-job:') || call.startsWith('remove-membership:')))
})

test('awaits each pruned membership and detached index in sorted lock order', async () => {
  const calls: string[] = []
  const useCase = createPruneMembershipsScenario(
    new MembershipPruningTestScenario(
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

  assert.ok(result.every((membership) => membership instanceof Membership))
  assert.deepEqual(
    result.map((membership) => membership.documentId),
    ['a-document', 'z-document'],
  )
  assert.deepEqual(
    calls.filter((call) => call.startsWith('lock-membership:')),
    ['lock-membership:kb:a-document', 'lock-membership:kb:z-document'],
  )
  assert.deepEqual(
    calls.filter((call) => call.startsWith('lock-index:')),
    ['lock-index:a-index', 'lock-index:z-index', 'lock-index:a-index', 'lock-index:z-index'],
  )
  assert.deepEqual(calls.slice(2, 4), ['lock-document', 'lock-document'])
  assert.equal(calls[4], 'lock-membership:kb:a-document')
  assert.deepEqual(
    calls.filter((call) => call.startsWith('lock-job:a-document:')),
    ['lock-job:a-document:a-index:1', 'lock-job:a-document:a-index:2', 'lock-job:a-document:z-index:0'],
  )
  const firstDocumentRetention = calls.findIndex((call) => call.startsWith('mark-document-unreferenced:'))
  assert.ok(firstDocumentRetention < calls.indexOf('lock-membership:kb:z-document'))
})

test('leaves memberships untouched when the knowledge base is outside the project', async () => {
  const calls: string[] = []
  const useCase = createPruneMembershipsScenario(
    new MembershipPruningTestScenario(
      createMembershipPruneCandidateFixture,
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
