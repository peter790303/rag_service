import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'

import type {
  GarbageCollectionTransaction,
  GarbageDocumentCandidate,
  GarbageFailedJobCandidate,
  GarbageIndexCandidate,
  GarbageRevisionCandidate,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-retention-operations.js'
import type { RagGarbageCollectionStore } from '../../../src/Application/KnowledgeBases/Contracts/rag-retention-store.js'
import { CollectRagGarbageUseCase } from '../../../src/Application/KnowledgeBases/UseCases/collect-rag-garbage.use-case.js'
import { RAG_DOCUMENT_INDEX_STATUS } from '../../../src/Domain/Knowledge/Enums/rag-document-index-status.enum.js'

const oldDate = new Date('2020-01-01T00:00:00.000Z')

const indexCandidate = (overrides: Partial<GarbageIndexCandidate> = {}): GarbageIndexCandidate => ({
  documentIndexId: 'index',
  documentId: 'document',
  status: RAG_DOCUMENT_INDEX_STATUS.READY,
  unreferencedSince: oldDate,
  readyAt: null,
  ...overrides,
})

const revisionCandidate = (overrides: Partial<GarbageRevisionCandidate> = {}): GarbageRevisionCandidate => ({
  documentRevisionId: 'revision',
  documentId: 'document',
  createdAt: oldDate,
  ...overrides,
})

const documentCandidate = (overrides: Partial<GarbageDocumentCandidate> = {}): GarbageDocumentCandidate => ({
  documentId: 'document',
  unreferencedSince: oldDate,
  ...overrides,
})

const storeWith = (transaction: GarbageCollectionTransaction): RagGarbageCollectionStore => ({
  withGarbageCollectionTransaction: async <T>(work: (tx: GarbageCollectionTransaction) => Promise<T>) =>
    work(transaction),
})

test('garbage collection locks candidates, rechecks references, and removes eligible rows in dependency order', async () => {
  const recent = new Date()
  const failedJobs: GarbageFailedJobCandidate[] = [
    { failedJobId: 'eligible-failure', documentId: 'document', failedAt: oldDate },
    { failedJobId: 'retried-failure', documentId: 'document', failedAt: oldDate },
    { failedJobId: 'recent-failure', documentId: 'document', failedAt: recent },
  ]
  const indexes = [
    indexCandidate({ documentIndexId: 'referenced-index' }),
    indexCandidate({ documentIndexId: 'shared-index' }),
    indexCandidate({ documentIndexId: 'failed-reference-index' }),
    indexCandidate({ documentIndexId: 'disappeared-index' }),
    indexCandidate({ documentIndexId: 'recent-index', unreferencedSince: recent }),
    indexCandidate({ documentIndexId: 'building-index', status: RAG_DOCUMENT_INDEX_STATUS.BUILDING }),
    indexCandidate({ documentIndexId: 'invalid-status', status: RAG_DOCUMENT_INDEX_STATUS.FAILED }),
    indexCandidate({ documentIndexId: 'late-target-index' }),
    indexCandidate({ documentIndexId: 'eligible-index' }),
  ]
  const revisions = [
    revisionCandidate({ documentRevisionId: 'referenced-revision' }),
    revisionCandidate({ documentRevisionId: 'recent-revision', createdAt: recent }),
    revisionCandidate({ documentRevisionId: 'eligible-revision' }),
  ]
  const documents = [
    documentCandidate({ documentId: 'referenced-document' }),
    documentCandidate({ documentId: 'recent-document', unreferencedSince: null }),
    documentCandidate({ documentId: 'eligible-document' }),
  ]
  const calls: string[] = []
  const cutoffs: Date[] = []
  let pendingOperation: string | null = null
  const completeOperation = async (operation: string): Promise<void> => {
    assert.equal(pendingOperation, null, `${operation} started before ${pendingOperation} completed`)
    pendingOperation = operation
    await setImmediate()
    pendingOperation = null
  }
  const collect = <
    T extends { failedJobId?: string; documentIndexId?: string; documentRevisionId?: string; documentId?: string },
  >(
    records: T[],
  ): T[] => records
  const useCase = new CollectRagGarbageUseCase(
    storeWith({
      findGarbageFailedJobCandidates: async (cutoff) => {
        calls.push('find-failed-jobs')
        cutoffs.push(cutoff)

        return collect(failedJobs)
      },
      lockFailedJobForRetention: async (id) => {
        await completeOperation(`lock-failed-job:${id}`)
        calls.push(`lock-failed-job:${id}`)
        const candidate = failedJobs.find((job) => job.failedJobId === id)

        return candidate ?? null
      },
      countRetriesForFailedJob: async (id) => (id === 'retried-failure' ? 1 : 0),
      removeFailedJob: async (id) => {
        await completeOperation(`remove-failed-job:${id}`)
        calls.push(`remove-failed-job:${id}`)
      },
      findGarbageIndexCandidates: async (cutoff) => {
        calls.push('find-indexes')
        cutoffs.push(cutoff)

        return collect(indexes)
      },
      findIndexRelationTargets: async (ids) =>
        ids.length === 1 && ids[0] === 'late-target-index'
          ? [{ documentIndexId: 'late-target-index', documentId: 'unobserved-target-document' }]
          : ids.includes('eligible-index')
            ? [{ documentIndexId: 'eligible-index', documentId: 'relation-target-document' }]
            : [],
      lockGarbageIndex: async (id) => {
        await completeOperation(`lock-index:${id}`)
        calls.push(`lock-index:${id}`)

        return id === 'disappeared-index' ? null : (indexes.find((index) => index.documentIndexId === id) ?? null)
      },
      countMembershipsForIndex: async (id) => (id === 'shared-index' ? 1 : 0),
      countJobsForIndex: async (id) => (id === 'referenced-index' ? 1 : 0),
      countFailedJobsForIndex: async (id) => (id === 'failed-reference-index' ? 1 : 0),
      removeRelationsForIndex: async (id) => {
        await completeOperation(`remove-relations:${id}`)
        calls.push(`remove-relations:${id}`)
      },
      removeChunksForIndex: async (id) => {
        await completeOperation(`remove-chunks:${id}`)
        calls.push(`remove-chunks:${id}`)
      },
      removeGarbageIndex: async (id) => {
        await completeOperation(`remove-index:${id}`)
        calls.push(`remove-index:${id}`)
      },
      findGarbageRevisionCandidates: async (cutoff) => {
        calls.push('find-revisions')
        cutoffs.push(cutoff)

        return collect(revisions)
      },
      lockGarbageRevision: async (id) => {
        await completeOperation(`lock-revision:${id}`)
        calls.push(`lock-revision:${id}`)

        return revisions.find((revision) => revision.documentRevisionId === id) ?? null
      },
      countIndexesForRevision: async (id) => (id === 'referenced-revision' ? 1 : 0),
      removeGarbageRevision: async (id) => {
        await completeOperation(`remove-revision:${id}`)
        calls.push(`remove-revision:${id}`)
      },
      findGarbageDocumentCandidates: async (cutoff) => {
        calls.push('find-documents')
        cutoffs.push(cutoff)

        return collect(documents)
      },
      lockGarbageDocument: async (id) => {
        await completeOperation(`lock-document:${id}`)
        calls.push(`lock-document:${id}`)

        return (
          documents.find((document) => document.documentId === id) ??
          documentCandidate({ documentId: id, unreferencedSince: id === 'relation-target-document' ? null : oldDate })
        )
      },
      markDocumentUnreferenced: async (id) => {
        await completeOperation(`mark-document-unreferenced:${id}`)
        calls.push(`mark-document-unreferenced:${id}`)
      },
      countMembershipsForDocument: async () => 0,
      countRevisionsForDocument: async () => 0,
      countIndexesForDocument: async () => 0,
      countJobsForDocument: async () => 0,
      countFailedJobsForDocument: async () => 0,
      countRelationsTargetingDocument: async (id) => (id === 'referenced-document' ? 1 : 0),
      removeGarbageDocument: async (id) => {
        await completeOperation(`remove-document:${id}`)
        calls.push(`remove-document:${id}`)
      },
    }),
    { gcRetentionMs: 60_000 },
  )

  const startedAt = Date.now()
  assert.equal(await useCase.execute(), 6)
  const completedAt = Date.now()

  assert.deepEqual(
    calls.filter((call) => call.startsWith('remove-')),
    [
      'remove-failed-job:eligible-failure',
      'remove-relations:building-index',
      'remove-chunks:building-index',
      'remove-index:building-index',
      'remove-relations:eligible-index',
      'remove-chunks:eligible-index',
      'remove-index:eligible-index',
      'remove-relations:invalid-status',
      'remove-chunks:invalid-status',
      'remove-index:invalid-status',
      'remove-revision:eligible-revision',
      'remove-document:eligible-document',
    ],
  )
  assert.ok(calls.indexOf('find-failed-jobs') < calls.indexOf('find-indexes'))
  assert.ok(calls.indexOf('find-indexes') < calls.indexOf('find-revisions'))
  assert.ok(calls.indexOf('find-revisions') < calls.indexOf('find-documents'))
  assert.deepEqual(
    calls.filter((call) => call.startsWith('lock-index:')),
    [
      'lock-index:building-index',
      'lock-index:disappeared-index',
      'lock-index:eligible-index',
      'lock-index:failed-reference-index',
      'lock-index:invalid-status',
      'lock-index:late-target-index',
      'lock-index:recent-index',
      'lock-index:referenced-index',
      'lock-index:shared-index',
    ],
    'GC must lock index rows in stable ID order to match activation',
  )
  assert.deepEqual(calls.filter((call) => call.startsWith('lock-document:')).slice(0, 5), [
    'lock-document:document',
    'lock-document:eligible-document',
    'lock-document:recent-document',
    'lock-document:referenced-document',
    'lock-document:relation-target-document',
  ])
  assert.ok(calls.includes('mark-document-unreferenced:relation-target-document'))
  assert.ok(
    !calls.includes('remove-index:late-target-index'),
    'a newly observed relation target waits for parent locking',
  )
  assert.ok(calls.indexOf('lock-document:document') < calls.indexOf('lock-failed-job:eligible-failure'))
  assert.ok(cutoffs.length > 0)
  const [cutoff] = cutoffs

  if (cutoff === undefined) throw new Error('Garbage collection did not provide a cutoff')

  assert.ok(cutoffs.every((value) => value === cutoff))
  assert.ok(cutoff.getTime() >= startedAt - 60_000)
  assert.ok(cutoff.getTime() <= completedAt - 60_000)
})
