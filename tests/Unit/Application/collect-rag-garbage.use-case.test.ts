import assert from 'node:assert/strict'
import test from 'node:test'

import { CollectRagGarbageUseCase } from '../../../src/Application/KnowledgeBases/UseCases/collect-rag-garbage.use-case.js'
import type { GarbageIndexCandidate } from '../../../src/Infrastructure/Persistence/Repositories/Contracts/rag-retention-store.js'

const candidate = (overrides: Partial<GarbageIndexCandidate> = {}): GarbageIndexCandidate => ({
  documentIndexId: 'index',
  documentId: 'document',
  status: 'ready',
  unreferencedSince: new Date('2020-01-01T00:00:00.000Z'),
  readyAt: null,
  membershipCount: 0,
  jobCount: 0,
  failedJobCount: 0,
  activeLeaseCount: 0,
  ...overrides,
})

test('garbage collection retains indexes with failed-job history and deletes only expired unreferenced indexes', async () => {
  const candidates = [
    candidate({ documentIndexId: 'failed-history', failedJobCount: 1 }),
    candidate({ documentIndexId: 'active-job', jobCount: 1 }),
    candidate({ documentIndexId: 'active-lease', activeLeaseCount: 1 }),
    candidate({ documentIndexId: 'recent', unreferencedSince: new Date() }),
    candidate({ documentIndexId: 'eligible' }),
  ]
  const deleted: string[] = []
  const cutoffs: Date[] = []
  const useCase = new CollectRagGarbageUseCase(
    {
      withGarbageCollectionTransaction: async (work: (transaction: never) => Promise<number>) =>
        work({
          deleteExpiredUnreferencedFailedJobs: async (cutoff: Date) => {
            cutoffs.push(cutoff)

            return 2
          },
          findGarbageIndexCandidates: async () => candidates,
          deleteIfUnreferenced: async (documentIndexId: string) => {
            deleted.push(documentIndexId)

            return true
          },
        } as never),
    } as never,
    { gcRetentionMs: 60_000 } as never,
  )

  const startedAt = Date.now()
  assert.equal(await useCase.execute(), 3)
  const completedAt = Date.now()
  assert.deepEqual(deleted, ['eligible'])
  assert.equal(cutoffs.length, 1)
  const cutoff = cutoffs[0]

  if (cutoff === undefined) throw new Error('Garbage collection did not provide a cutoff')

  assert.ok(cutoff.getTime() >= startedAt - 60_000)
  assert.ok(cutoff.getTime() <= completedAt - 60_000)
})
