import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'

import {
  createDocumentFixture,
  createRestoredKnowledgeBaseDocumentFixture,
  createRestoredDocumentIndexFixture,
  createRepositoryStub,
} from './document-index-lifecycle.fixture.ts'
import {
  createGarbageCollectionListener,
  type GarbageCollectionTestDependencies,
} from './document-retention-use-cases.fixture.ts'
import type { ExpiredDocumentIndexFailureDTO } from '../../../src/DocumentIndexes/Application/DTOs/expired-document-index-failure.dto.ts'
import type { DocumentIndexStatus } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { DocumentRelation } from '../../../src/DocumentRelations/Domain/Entities/document-relation.ts'
import { DocumentRevision } from '../../../src/DocumentRevisions/Domain/Entities/document-revision.ts'
import { DocumentGarbageCollectionRequestedEvent } from '../../../src/Documents/Application/Events/document-garbage-collection-requested.event.ts'

type GarbageDocumentIndexCandidateDTO = {
  documentIndexId: string
  documentId: string
  status: DocumentIndexStatus
  unreferencedSince: Date | null
  readyAt: Date | null
}

type GarbageDocumentRevisionCandidateDTO = {
  documentRevisionId: string
  documentId: string
  createdAt: Date
}

type GarbageDocumentCandidateDTO = {
  documentId: string
  unreferencedSince: Date | null
}

const oldDate = new Date('2020-01-01T00:00:00.000Z')

const createGarbageDocumentIndexCandidateFixture = (
  overrides: Partial<GarbageDocumentIndexCandidateDTO> = {},
): GarbageDocumentIndexCandidateDTO => ({
  documentIndexId: 'index',
  documentId: 'document',
  status: DocumentIndexStatusEnum.READY,
  unreferencedSince: oldDate,
  readyAt: null,
  ...overrides,
})

const createGarbageDocumentRevisionCandidateFixture = (
  overrides: Partial<GarbageDocumentRevisionCandidateDTO> = {},
): GarbageDocumentRevisionCandidateDTO => ({
  documentRevisionId: 'revision',
  documentId: 'document',
  createdAt: oldDate,
  ...overrides,
})

const createGarbageDocumentCandidateFixture = (
  overrides: Partial<GarbageDocumentCandidateDTO> = {},
): GarbageDocumentCandidateDTO => ({
  documentId: 'document',
  unreferencedSince: oldDate,
  ...overrides,
})

test('garbage collection locks candidates, rechecks references, and removes eligible rows in dependency order', async () => {
  const recent = new Date()
  const failedJobs: ExpiredDocumentIndexFailureDTO[] = [
    { failedJobId: 'eligible-failure', documentId: 'document', failedAt: oldDate },
    { failedJobId: 'retried-failure', documentId: 'document', failedAt: oldDate },
    { failedJobId: 'recent-failure', documentId: 'document', failedAt: recent },
    { failedJobId: 'changed-parent-failure', documentId: 'document', failedAt: oldDate },
  ]
  const indexes = [
    createGarbageDocumentIndexCandidateFixture({ documentIndexId: 'referenced-index' }),
    createGarbageDocumentIndexCandidateFixture({ documentIndexId: 'shared-index' }),
    createGarbageDocumentIndexCandidateFixture({ documentIndexId: 'failed-reference-index' }),
    createGarbageDocumentIndexCandidateFixture({ documentIndexId: 'disappeared-index' }),
    createGarbageDocumentIndexCandidateFixture({ documentIndexId: 'recent-index', unreferencedSince: recent }),
    createGarbageDocumentIndexCandidateFixture({
      documentIndexId: 'building-index',
      status: DocumentIndexStatusEnum.BUILDING,
    }),
    createGarbageDocumentIndexCandidateFixture({
      documentIndexId: 'invalid-status',
      status: DocumentIndexStatusEnum.FAILED,
    }),
    createGarbageDocumentIndexCandidateFixture({ documentIndexId: 'late-target-index' }),
    createGarbageDocumentIndexCandidateFixture({ documentIndexId: 'eligible-index' }),
    createGarbageDocumentIndexCandidateFixture({ documentIndexId: 'changed-parent-index' }),
  ]
  const revisions = [
    createGarbageDocumentRevisionCandidateFixture({ documentRevisionId: 'referenced-revision' }),
    createGarbageDocumentRevisionCandidateFixture({ documentRevisionId: 'recent-revision', createdAt: recent }),
    createGarbageDocumentRevisionCandidateFixture({ documentRevisionId: 'eligible-revision' }),
    createGarbageDocumentRevisionCandidateFixture({ documentRevisionId: 'changed-parent-revision' }),
  ]
  const documents = [
    createGarbageDocumentCandidateFixture({ documentId: 'referenced-document' }),
    createGarbageDocumentCandidateFixture({ documentId: 'recent-document', unreferencedSince: null }),
    createGarbageDocumentCandidateFixture({ documentId: 'eligible-document' }),
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
  const toIndexRecord = (candidate: GarbageDocumentIndexCandidateDTO) =>
    createRestoredDocumentIndexFixture({
      id: candidate.documentIndexId,
      documentId: candidate.documentId,
      status: candidate.status,
      readyAt: candidate.readyAt,
      unreferencedSince: candidate.unreferencedSince,
    })
  const toRevisionRecord = (candidate: GarbageDocumentRevisionCandidateDTO) =>
    new DocumentRevision({
      id: candidate.documentRevisionId,
      documentId: candidate.documentId,
      contentSha256: 'a'.repeat(64),
      title: null,
      content: '',
      capturedAt: oldDate,
      createdAt: candidate.createdAt,
    })
  const toDocumentRecord = (candidate: GarbageDocumentCandidateDTO) =>
    createDocumentFixture({
      id: candidate.documentId,
      unreferencedSince: candidate.unreferencedSince,
    })
  const useCase = createGarbageCollectionListener(
    {
      run: async (operation) => operation(),
      runReadOnlySnapshot: async () => assert.fail('collecting document garbage uses a write transaction'),
    },
    createRepositoryStub<GarbageCollectionTestDependencies[1]>({
      findByDocumentId: async ({ documentId }) => createDocumentFixture({ id: documentId }),
      findByUnreferencedSinceLessThanOrEqual: async (documentGarbageCandidatesQO) => {
        const { cutoff } = documentGarbageCandidatesQO

        calls.push('find-documents')
        cutoffs.push(cutoff)

        return documents.map(toDocumentRecord)
      },
      lockByDocumentId: async (documentIdQO) => {
        const { documentId } = documentIdQO

        await completeOperation(`lock-document:${documentId}`)
        calls.push(`lock-document:${documentId}`)
        const candidate =
          documents.find((document) => document.documentId === documentId) ??
          createGarbageDocumentCandidateFixture({
            documentId,
            unreferencedSince: documentId === 'relation-target-document' ? null : oldDate,
          })

        return toDocumentRecord(candidate)
      },
      updateUnreferencedSinceByDocumentIdAndUnreferencedSinceIsNull: async (markDocumentUnreferencedQO) => {
        const { documentId } = markDocumentUnreferencedQO

        await completeOperation(`mark-document-unreferenced:${documentId}`)
        calls.push(`mark-document-unreferenced:${documentId}`)
      },
      deleteByDocumentId: async (documentIdQO) => {
        const { documentId } = documentIdQO

        await completeOperation(`remove-document:${documentId}`)
        calls.push(`remove-document:${documentId}`)
      },
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[2]>({
      findByActiveDocumentIndexId: async (knowledgeBaseDocumentActiveIndexQO) => {
        const { documentIndexId } = knowledgeBaseDocumentActiveIndexQO

        return documentIndexId === 'shared-index'
          ? createRestoredKnowledgeBaseDocumentFixture({ activeDocumentIndexId: documentIndexId })
          : null
      },
      findByDocumentId: async () => null,
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[3]>({
      countFailureRetries: async (jobRetrySourceQO) => {
        const { failedJobId } = jobRetrySourceQO

        return failedJobId === 'retried-failure' ? 1 : 0
      },
      countIndexExecutions: async (jobIndexQO) => {
        const { documentIndexId } = jobIndexQO

        return documentIndexId === 'referenced-index' ? 1 : 0
      },
      countDocumentExecutions: async () => 0,
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[4]>({
      findByUnreferencedSinceLessThanOrEqualOrderByIdAsc: async (documentIndexGarbageCandidatesQO) => {
        const { cutoff } = documentIndexGarbageCandidatesQO

        calls.push('find-indexes')
        cutoffs.push(cutoff)

        return indexes.map(toIndexRecord)
      },
      lockByDocumentIndexId: async (documentIndexIdQO) => {
        const { documentIndexId } = documentIndexIdQO

        await completeOperation(`lock-index:${documentIndexId}`)
        calls.push(`lock-index:${documentIndexId}`)
        const candidate =
          documentIndexId === 'changed-parent-index'
            ? createGarbageDocumentIndexCandidateFixture({ documentIndexId, documentId: 'unlocked-document' })
            : indexes.find((index) => index.documentIndexId === documentIndexId)

        return documentIndexId === 'disappeared-index' || !candidate ? null : toIndexRecord(candidate)
      },
      findByRevisionId: async (documentIndexRevisionQO) => {
        const { revisionId } = documentIndexRevisionQO

        return revisionId === 'referenced-revision' ? [createRestoredDocumentIndexFixture({ revisionId })] : []
      },
      findByDocumentId: async () => [],
      deleteByDocumentIndexId: async (documentIndexIdQO) => {
        const { documentIndexId } = documentIndexIdQO

        await completeOperation(`remove-index:${documentIndexId}`)
        calls.push(`remove-index:${documentIndexId}`)
      },
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[5]>({
      findByCreatedAtLessThanOrEqual: async (documentRevisionGarbageCandidatesQO) => {
        const { cutoff } = documentRevisionGarbageCandidatesQO

        calls.push('find-revisions')
        cutoffs.push(cutoff)

        return revisions.map(toRevisionRecord)
      },
      lockByDocumentRevisionId: async (documentRevisionIdQO) => {
        const { revisionId } = documentRevisionIdQO

        await completeOperation(`lock-revision:${revisionId}`)
        calls.push(`lock-revision:${revisionId}`)
        const candidate =
          revisionId === 'changed-parent-revision'
            ? createGarbageDocumentRevisionCandidateFixture({
                documentRevisionId: revisionId,
                documentId: 'unlocked-document',
              })
            : revisions.find((revision) => revision.documentRevisionId === revisionId)

        return candidate ? toRevisionRecord(candidate) : null
      },
      findByDocumentIdOrderByCreatedAtDesc: async () => null,
      deleteByDocumentRevisionId: async (documentRevisionIdQO) => {
        const { revisionId } = documentRevisionIdQO

        await completeOperation(`remove-revision:${revisionId}`)
        calls.push(`remove-revision:${revisionId}`)
      },
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[6]>({
      findExpiredFailures: async (failedJobGarbageQO) => {
        const { cutoff } = failedJobGarbageQO

        calls.push('find-failed-jobs')
        cutoffs.push(cutoff)

        return failedJobs
      },
      lockExpiredFailure: async (failedJobIdQO) => {
        const { failedJobId } = failedJobIdQO

        await completeOperation(`lock-failed-job:${failedJobId}`)
        calls.push(`lock-failed-job:${failedJobId}`)
        const candidate = failedJobs.find((job) => job.failedJobId === failedJobId)

        return candidate && failedJobId === 'changed-parent-failure'
          ? { ...candidate, documentId: 'unlocked-document' }
          : (candidate ?? null)
      },
      countIndexFailures: async (failedJobIndexQO) => {
        const { documentIndexId } = failedJobIndexQO

        return documentIndexId === 'failed-reference-index' ? 1 : 0
      },
      countDocumentFailures: async () => 0,
      removeExpiredFailure: async (failedJobIdQO) => {
        const { failedJobId } = failedJobIdQO

        await completeOperation(`remove-failed-job:${failedJobId}`)
        calls.push(`remove-failed-job:${failedJobId}`)
      },
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[7]>({
      removeByDocumentIndexId: async (chunkIndexQO) => {
        const { documentIndexId } = chunkIndexQO

        await completeOperation(`remove-chunks:${documentIndexId}`)
        calls.push(`remove-chunks:${documentIndexId}`)
      },
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[8]>({
      findBySourceIndexIdsOrderByIdAsc: async (documentRelationSourceIndexesQO) => {
        const { sourceIndexIds } = documentRelationSourceIndexesQO

        const targets =
          sourceIndexIds.length === 1 && sourceIndexIds[0] === 'late-target-index'
            ? [{ documentIndexId: 'late-target-index', documentId: 'unobserved-target-document' }]
            : sourceIndexIds.includes('eligible-index')
              ? [{ documentIndexId: 'eligible-index', documentId: 'relation-target-document' }]
              : []

        return targets.map(
          (target) =>
            new DocumentRelation({
              id: 'relation',
              sourceIndexId: target.documentIndexId,
              targetDocumentId: target.documentId,
              targetReference: 'target.md',
              targetAnchor: null,
              relationType: 'wiki_link',
              evidenceBlockStart: 0,
              evidenceBlockEnd: 1,
              evidenceText: '[[target]]',
            }),
        )
      },
      findByTargetDocumentId: async (documentRelationTargetDocumentQO) => {
        const { documentId } = documentRelationTargetDocumentQO

        return documentId === 'referenced-document'
          ? new DocumentRelation({
              id: 'reference',
              sourceIndexId: 'source',
              targetDocumentId: documentId,
              targetReference: 'target.md',
              targetAnchor: null,
              relationType: 'wiki_link',
              evidenceBlockStart: 0,
              evidenceBlockEnd: 1,
              evidenceText: '[[target]]',
            })
          : null
      },
      removeBySourceIndexId: async (documentRelationSourceIndexQO) => {
        const { sourceIndexId } = documentRelationSourceIndexQO

        await completeOperation(`remove-relations:${sourceIndexId}`)
        calls.push(`remove-relations:${sourceIndexId}`)
      },
    }),
    { gcRetentionMs: 60_000 },
  )

  const startedAt = Date.now()
  assert.equal(await useCase.handle(new DocumentGarbageCollectionRequestedEvent()), undefined)
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
      'lock-index:changed-parent-index',
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

test('garbage collection cleans and retains a failure-only document when there are no index candidates', async () => {
  const calls: string[] = []
  const failure: ExpiredDocumentIndexFailureDTO = {
    failedJobId: 'failure-only',
    documentId: 'failure-only-document',
    failedAt: oldDate,
  }
  const useCase = createGarbageCollectionListener(
    {
      run: async (operation) => operation(),
      runReadOnlySnapshot: async () => assert.fail('collecting document garbage uses a write transaction'),
    },
    createRepositoryStub<GarbageCollectionTestDependencies[1]>({
      findByDocumentId: async ({ documentId }) => createDocumentFixture({ id: documentId }),
      findByUnreferencedSinceLessThanOrEqual: async () => [],
      lockByDocumentId: async (documentIdQO) => {
        calls.push(`lock-document:${documentIdQO.documentId}`)

        return createDocumentFixture({ id: documentIdQO.documentId })
      },
      updateUnreferencedSinceByDocumentIdAndUnreferencedSinceIsNull: async (documentIdQO) => {
        calls.push(`mark-document-unreferenced:${documentIdQO.documentId}`)
      },
      deleteByDocumentId: async () => undefined,
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[2]>({
      findByActiveDocumentIndexId: async () => null,
      findByDocumentId: async () => null,
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[3]>({
      countFailureRetries: async () => 0,
      countIndexExecutions: async () => 0,
      countDocumentExecutions: async () => 0,
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[4]>({
      findByUnreferencedSinceLessThanOrEqualOrderByIdAsc: async () => {
        calls.push('find-index-candidates')

        return []
      },
      lockByDocumentIndexId: async () => null,
      findByRevisionId: async () => [],
      findByDocumentId: async () => [],
      deleteByDocumentIndexId: async () => undefined,
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[5]>({
      findByCreatedAtLessThanOrEqual: async () => [],
      lockByDocumentRevisionId: async () => null,
      findByDocumentIdOrderByCreatedAtDesc: async () => null,
      deleteByDocumentRevisionId: async () => undefined,
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[6]>({
      findExpiredFailures: async () => [failure],
      lockExpiredFailure: async (failedJobIdQO) => {
        calls.push(`lock-failure:${failedJobIdQO.failedJobId}`)

        return failure
      },
      countIndexFailures: async () => 0,
      countDocumentFailures: async () => 0,
      removeExpiredFailure: async (failedJobIdQO) => {
        calls.push(`remove-failure:${failedJobIdQO.failedJobId}`)
      },
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[7]>({
      removeByDocumentIndexId: async () => undefined,
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[8]>({
      findBySourceIndexIdsOrderByIdAsc: async () => [],
      findByTargetDocumentId: async () => null,
      removeBySourceIndexId: async () => undefined,
    }),
    { gcRetentionMs: 60_000 },
  )

  await useCase.handle(new DocumentGarbageCollectionRequestedEvent())

  assert.ok(calls.includes('find-index-candidates'))
  assert.ok(calls.includes('remove-failure:failure-only'))
  assert.ok(calls.includes('mark-document-unreferenced:failure-only-document'))
  assert.ok(
    calls.indexOf('lock-document:failure-only-document') < calls.indexOf('lock-failure:failure-only'),
    'the parent document must be locked before its failure row',
  )
  assert.ok(
    calls.indexOf('remove-failure:failure-only') < calls.indexOf('mark-document-unreferenced:failure-only-document'),
    'retention marking must follow failure cleanup',
  )
})
