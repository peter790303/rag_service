import assert from 'node:assert/strict'
import test from 'node:test'

import { PruneRagMembershipsUseCase } from '../../../src/Application/KnowledgeBases/UseCases/prune-rag-memberships.use-case.js'
import {
  MembershipPruneTransaction,
  RagMembershipPruningStore,
  type MembershipPruneRecord,
} from '../../../src/Infrastructure/Persistence/Repositories/Contracts/rag-retention-store.js'

class TestMembershipPruningStore extends RagMembershipPruningStore {
  constructor(
    private readonly candidate: MembershipPruneRecord,
    private readonly calls: string[],
    private readonly membershipRemovalResult = true,
  ) {
    super()
  }

  async withPruneTransaction<T>(work: (transaction: MembershipPruneTransaction) => Promise<T>): Promise<T> {
    return work({
      findMembershipPruneRecords: async (projectId, knowledgeBaseId, documentIds) => {
        this.calls.push(`find:${projectId}:${knowledgeBaseId}:${documentIds.join(',')}`)

        return [this.candidate]
      },
      clearActiveIndex: async () => {
        this.calls.push('clear-active-index')

        return true
      },
      removeMembership: async () => {
        this.calls.push('remove-membership')

        return this.membershipRemovalResult
      },
      cancelJobsForDocument: async (knowledgeBaseId, documentId) => {
        this.calls.push(`cancel-jobs:${knowledgeBaseId}:${documentId}`)
      },
    })
  }
}

const candidateWithActiveLease: MembershipPruneRecord = {
  membershipId: 'kb:document',
  knowledgeBaseId: 'kb',
  documentId: 'document',
  activeDocumentIndexId: 'active-index',
  jobs: [
    {
      id: 'leased-job',
      status: 'running',
      leaseExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    },
  ],
}

test('prunes a membership and cancels its jobs even when a job has an active lease', async () => {
  const calls: string[] = []
  const useCase = new PruneRagMembershipsUseCase(new TestMembershipPruningStore(candidateWithActiveLease, calls))

  const result = await useCase.execute('project', 'kb', [])

  assert.deepEqual(result, { pruned: 1 })
  assert.deepEqual(calls, ['find:project:kb:', 'clear-active-index', 'remove-membership', 'cancel-jobs:kb:document'])
})

test('does not cancel jobs when membership removal did not succeed', async () => {
  const calls: string[] = []
  const useCase = new PruneRagMembershipsUseCase(new TestMembershipPruningStore(candidateWithActiveLease, calls, false))

  await assert.rejects(useCase.execute('project', 'kb', []), /Failed to remove membership/)

  assert.deepEqual(calls, ['find:project:kb:', 'clear-active-index', 'remove-membership'])
})
