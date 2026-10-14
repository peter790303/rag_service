import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'

import {
  MembershipPruneTransaction,
  type MembershipPruneRecord,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-retention-operations.js'
import { RagMembershipPruningStore } from '../../../src/Application/KnowledgeBases/Contracts/rag-retention-store.js'
import { PruneRagMembershipsUseCase } from '../../../src/Application/KnowledgeBases/UseCases/prune-rag-memberships.use-case.js'
import { KnowledgeMembershipPruneConflictException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-membership-prune-conflict.exception.js'

class TestMembershipPruningStore extends RagMembershipPruningStore {
  private pendingOperation: string | null = null

  constructor(
    private readonly candidate: MembershipPruneRecord,
    private readonly calls: string[],
    private readonly membershipRemovalResult = true,
    private currentActiveIndexId: string | null = 'active-index',
    private readonly membershipLockResult = true,
    private readonly cancelledIndexIds: string[] = [],
    private readonly membershipReferenceCount = 0,
    private readonly jobReferenceCount = 0,
    private readonly projectMatches = true,
    private readonly additionalCandidates: readonly MembershipPruneRecord[] = [],
  ) {
    super()
  }

  async withPruneTransaction<T>(work: (transaction: MembershipPruneTransaction) => Promise<T>): Promise<T> {
    return work({
      isKnowledgeBaseInProject: async (projectId, knowledgeBaseId) => {
        this.calls.push(`project:${projectId}:${knowledgeBaseId}`)

        return this.projectMatches
      },
      findMembershipPruneRecords: async (knowledgeBaseId) => {
        this.calls.push(`find:${knowledgeBaseId}`)

        return [this.candidate, ...this.additionalCandidates]
      },
      lockDocumentForPrune: async () => {
        await this.completeOperation('lock-document')
        this.calls.push('lock-document')

        return true
      },
      lockMembershipForPrune: async (knowledgeBaseId, documentId) => {
        await this.completeOperation('lock-membership')
        this.calls.push(`lock-membership:${knowledgeBaseId}:${documentId}`)

        return this.membershipLockResult ? { activeDocumentIndexId: this.currentActiveIndexId } : null
      },
      clearActiveIndex: async (knowledgeBaseId, documentId) => {
        await this.completeOperation('clear-active-index')
        this.calls.push(`clear-active-index:${knowledgeBaseId}:${documentId}:${this.currentActiveIndexId ?? 'null'}`)
        this.currentActiveIndexId = null

        return true
      },
      removeMembership: async (knowledgeBaseId, documentId) => {
        await this.completeOperation('remove-membership')
        this.calls.push(`remove-membership:${knowledgeBaseId}:${documentId}`)

        return this.membershipRemovalResult
      },
      cancelJobsForDocument: async (knowledgeBaseId, documentId) => {
        await this.completeOperation('cancel-jobs')
        this.calls.push(`cancel-jobs:${knowledgeBaseId}:${documentId}`)

        return this.cancelledIndexIds
      },
      lockIndexForPrune: async (documentIndexId) => {
        await this.completeOperation('lock-index')
        this.calls.push(`lock-index:${documentIndexId}`)

        return true
      },
      countMembershipsForIndex: async () => this.membershipReferenceCount,
      countJobsForIndex: async () => this.jobReferenceCount,
      markIndexUnreferenced: async (documentIndexId, unreferencedSince) => {
        await this.completeOperation('mark-index-unreferenced')
        this.calls.push(`mark-index-unreferenced:${documentIndexId}:${unreferencedSince.toISOString()}`)
      },
      countMembershipsForDocument: async () => 0,
      countRevisionsForDocument: async () => 0,
      countIndexesForDocument: async () => 0,
      countJobsForDocument: async () => 0,
      countFailedJobsForDocument: async () => 0,
      countRelationsTargetingDocument: async () => 0,
      markDocumentUnreferenced: async (_documentId, unreferencedSince) => {
        await this.completeOperation('mark-document-unreferenced')
        this.calls.push(`mark-document-unreferenced:${unreferencedSince.toISOString()}`)
      },
    })
  }

  private async completeOperation(operation: string): Promise<void> {
    assert.equal(this.pendingOperation, null, `${operation} started before ${this.pendingOperation} completed`)
    this.pendingOperation = operation
    await setImmediate()
    this.pendingOperation = null
  }
}

const candidate: MembershipPruneRecord = {
  knowledgeBaseId: 'kb',
  documentId: 'document',
}

test('prunes a membership and cancels its jobs even when a job has an active lease', async () => {
  const calls: string[] = []
  const useCase = new PruneRagMembershipsUseCase(new TestMembershipPruningStore(candidate, calls))

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.deepEqual(result, { pruned: 1 })
  const callsWithoutTimestamps = calls.map((call) => call.replace(/:\d{4}-\d{2}-\d{2}T.*$/, ':<timestamp>'))
  assert.deepEqual(callsWithoutTimestamps, [
    'project:project:kb',
    'find:kb',
    'lock-document',
    'lock-membership:kb:document',
    'cancel-jobs:kb:document',
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

test('cancels jobs before removing the membership so its foreign key does not block pruning', async () => {
  const calls: string[] = []
  const useCase = new PruneRagMembershipsUseCase(new TestMembershipPruningStore(candidate, calls, false))

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
      'cancel-jobs:kb:document',
      'clear-active-index:kb:document:active-index',
      'remove-membership:kb:document',
    ],
  )
})

test('uses the membership lock reread instead of stale candidate fields before clearing its active index', async () => {
  const calls: string[] = []
  const staleCandidate = { knowledgeBaseId: 'kb', documentId: 'document' }
  const useCase = new PruneRagMembershipsUseCase(new TestMembershipPruningStore(staleCandidate, calls))

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.deepEqual(result, { pruned: 1 })
  assert.ok(calls.includes('clear-active-index:kb:document:active-index'))
})

test('filters retained documents in the use case before taking locks', async () => {
  const calls: string[] = []
  const useCase = new PruneRagMembershipsUseCase(new TestMembershipPruningStore(candidate, calls))

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: ['document'] })

  assert.deepEqual(result, { pruned: 0 })
  assert.deepEqual(calls, ['project:project:kb', 'find:kb'])
})

test('skips a membership that disappeared before the locked reread', async () => {
  const calls: string[] = []
  const useCase = new PruneRagMembershipsUseCase(
    new TestMembershipPruningStore(candidate, calls, true, 'active-index', false),
  )

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.deepEqual(result, { pruned: 0 })
  assert.deepEqual(calls, ['project:project:kb', 'find:kb', 'lock-document', 'lock-membership:kb:document'])
})

test('does not mark an absent active index as unreferenced', async () => {
  const calls: string[] = []
  const useCase = new PruneRagMembershipsUseCase(new TestMembershipPruningStore(candidate, calls, true, null))

  const result = await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.deepEqual(result, { pruned: 1 })
  assert.ok(!calls.some((call) => call.startsWith('mark-index-unreferenced:')))
})

test('preserves a shared active index referenced by another membership', async () => {
  const calls: string[] = []
  const useCase = new PruneRagMembershipsUseCase(
    new TestMembershipPruningStore(candidate, calls, true, 'shared-index', true, [], 1),
  )

  assert.deepEqual(await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] }), {
    pruned: 1,
  })
  assert.ok(calls.includes('lock-index:shared-index'))
  assert.ok(!calls.some((call) => call.startsWith('mark-index-unreferenced:')))
})

test('preserves an index referenced by a job in another knowledge base', async () => {
  const calls: string[] = []
  const useCase = new PruneRagMembershipsUseCase(
    new TestMembershipPruningStore(candidate, calls, true, 'shared-index', true, [], 0, 1),
  )

  await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.ok(!calls.some((call) => call.startsWith('mark-index-unreferenced:')))
})

test('starts retention for cancelled job outputs even when the membership had no active index', async () => {
  const calls: string[] = []
  const useCase = new PruneRagMembershipsUseCase(
    new TestMembershipPruningStore(candidate, calls, true, null, true, ['building-index', 'building-index']),
  )

  await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] })

  assert.equal(calls.filter((call) => call === 'lock-index:building-index').length, 1)
  assert.equal(calls.filter((call) => call.startsWith('mark-index-unreferenced:building-index:')).length, 1)
})

test('awaits each pruned membership and detached index in sorted lock order', async () => {
  const calls: string[] = []
  const useCase = new PruneRagMembershipsUseCase(
    new TestMembershipPruningStore(
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

  assert.deepEqual(await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] }), {
    pruned: 2,
  })
  assert.deepEqual(
    calls.filter((call) => call.startsWith('lock-membership:')),
    ['lock-membership:kb:a-document', 'lock-membership:kb:z-document'],
  )
  assert.deepEqual(
    calls.filter((call) => call.startsWith('lock-index:')),
    ['lock-index:a-index', 'lock-index:z-index', 'lock-index:a-index', 'lock-index:z-index'],
  )
  const firstDocumentRetention = calls.findIndex((call) => call.startsWith('mark-document-unreferenced:'))
  assert.ok(firstDocumentRetention < calls.indexOf('lock-membership:kb:z-document'))
})

test('leaves memberships untouched when the knowledge base is outside the project', async () => {
  const calls: string[] = []
  const useCase = new PruneRagMembershipsUseCase(
    new TestMembershipPruningStore(candidate, calls, true, 'active-index', true, [], 0, 0, false),
  )

  assert.deepEqual(await useCase.execute({ projectId: 'project', knowledgeBaseId: 'kb', documentIds: [] }), {
    pruned: 0,
  })
  assert.deepEqual(calls, ['project:project:kb'])
})
