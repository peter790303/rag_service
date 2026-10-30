import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createJobRecordFixture,
  createRepositoryStub,
  createRestoredDocumentIndexFixture,
} from './document-index-lifecycle.fixture.ts'
import { StartDocumentIndexPruningRetentionCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/start-document-index-pruning-retention.command.handler.ts'
import { CancelKnowledgeBaseDocumentDocumentIndexingListener } from '../../../src/DocumentIndexes/Application/Listeners/cancel-knowledge-base-document-document-indexing.listener.ts'
import type { DocumentIndexExecutionQueue } from '../../../src/DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexRepository } from '../../../src/DocumentIndexes/Application/Ports/Out/Repositories/document-index.repository.ts'
import type { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../../../src/KnowledgeBaseDocuments/Application/Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'
import { KnowledgeBaseDocumentPruningStartedEvent } from '../../../src/KnowledgeBaseDocuments/Application/Events/knowledge-base-document-pruning-started.event.ts'

const createDeferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolvePromise = (): void => {}
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  return { promise, resolve: resolvePromise }
}

test('knowledgeBaseDocument pruning cancels sorted executions one at a time and awaits each release', async () => {
  const calls: string[] = []
  const firstReleaseStarted = createDeferred()
  const finishFirstRelease = createDeferred()
  const jobs = [
    createJobRecordFixture({
      id: 'job-c',
      knowledgeBaseId: 'kb-1',
      documentId: 'document-1',
      documentIndexId: 'index-c',
    }),
    createJobRecordFixture({
      id: 'job-a',
      knowledgeBaseId: 'kb-1',
      documentId: 'document-1',
      documentIndexId: 'index-a',
    }),
    createJobRecordFixture({
      id: 'job-b',
      knowledgeBaseId: 'kb-1',
      documentId: 'document-1',
      documentIndexId: 'index-b',
    }),
  ]
  const queue = createRepositoryStub<DocumentIndexExecutionQueue>({
    async findKnowledgeBaseDocumentExecutions() {
      calls.push('find')

      return jobs
    },
    async lockExecution(query) {
      calls.push(`lock:${query.jobId}`)

      return jobs.find((job) => job.id === query.jobId) ?? null
    },
    async releaseExecution(query) {
      calls.push(`release:start:${query.jobId}`)

      if (query.jobId === 'job-a') {
        firstReleaseStarted.resolve()
        await finishFirstRelease.promise
      }

      calls.push(`release:finish:${query.jobId}`)
    },
  })
  const listener = new CancelKnowledgeBaseDocumentDocumentIndexingListener(queue)
  const pending = listener.handle(new KnowledgeBaseDocumentPruningStartedEvent('kb-1', 'document-1'))

  await firstReleaseStarted.promise
  const callsBeforeFirstReleaseFinishes = [...calls]
  finishFirstRelease.resolve()
  const detachedIndexIds = await pending

  assert.deepEqual(callsBeforeFirstReleaseFinishes, ['find', 'lock:job-a', 'release:start:job-a'])
  assert.deepEqual(calls, [
    'find',
    'lock:job-a',
    'release:start:job-a',
    'release:finish:job-a',
    'lock:job-b',
    'release:start:job-b',
    'release:finish:job-b',
    'lock:job-c',
    'release:start:job-c',
    'release:finish:job-c',
  ])
  assert.deepEqual(detachedIndexIds, ['index-a', 'index-b', 'index-c'])
})

test('knowledgeBaseDocument pruning stops at the first failed execution lock', async () => {
  const calls: string[] = []
  const failure = new Error('execution lock failed')
  const jobs = [
    createJobRecordFixture({ id: 'job-c', knowledgeBaseId: 'kb-1', documentId: 'document-1' }),
    createJobRecordFixture({ id: 'job-a', knowledgeBaseId: 'kb-1', documentId: 'document-1' }),
    createJobRecordFixture({ id: 'job-b', knowledgeBaseId: 'kb-1', documentId: 'document-1' }),
  ]
  const queue = createRepositoryStub<DocumentIndexExecutionQueue>({
    async findKnowledgeBaseDocumentExecutions() {
      return jobs
    },
    async lockExecution(query) {
      calls.push(`lock:${query.jobId}`)

      if (query.jobId === 'job-b') throw failure

      return jobs.find((job) => job.id === query.jobId) ?? null
    },
    async releaseExecution(query) {
      calls.push(`release:${query.jobId}`)
    },
  })
  const listener = new CancelKnowledgeBaseDocumentDocumentIndexingListener(queue)

  await assert.rejects(
    listener.handle(new KnowledgeBaseDocumentPruningStartedEvent('kb-1', 'document-1')),
    (error: unknown) => error === failure,
  )

  assert.deepEqual(calls, ['lock:job-a', 'release:job-a', 'lock:job-b'])
})

test('knowledgeBaseDocument pruning completes an empty execution batch without locking or releasing work', async () => {
  const queue = createRepositoryStub<DocumentIndexExecutionQueue>({
    async findKnowledgeBaseDocumentExecutions() {
      return []
    },
    async lockExecution() {
      assert.fail('an empty pruning batch must not lock executions')
    },
    async releaseExecution() {
      assert.fail('an empty pruning batch must not release executions')
    },
  })
  const listener = new CancelKnowledgeBaseDocumentDocumentIndexingListener(queue)

  assert.deepEqual(await listener.handle(new KnowledgeBaseDocumentPruningStartedEvent('kb-1', 'document-1')), [])
})

test('index pruning retention awaits each sorted index lifecycle update before starting the next index', async () => {
  const calls: string[] = []
  const firstUpdateStarted = createDeferred()
  const finishFirstUpdate = createDeferred()
  const now = new Date('2026-10-18T00:00:00.000Z')
  const documentIndexRepository = createRepositoryStub<DocumentIndexRepository>({
    async lockByDocumentIndexId(query) {
      calls.push(`lock:${query.documentIndexId}`)

      return createRestoredDocumentIndexFixture({ id: query.documentIndexId })
    },
    async updateByDocumentIndexIdWithLifecycleFields(query) {
      calls.push(`update:start:${query.documentIndexId}`)
      assert.equal(query.unreferencedSince?.toISOString(), now.toISOString())

      if (query.documentIndexId === 'index-a') {
        firstUpdateStarted.resolve()
        await finishFirstUpdate.promise
      }

      calls.push(`update:finish:${query.documentIndexId}`)
    },
  })
  const executionQueue = createRepositoryStub<DocumentIndexExecutionQueue>({
    async countIndexExecutions(query) {
      calls.push(`count:${query.documentIndexId}`)

      return 0
    },
  })
  const knowledgeBaseDocumentRetention =
    createRepositoryStub<InspectKnowledgeBaseDocumentRetentionQueryHandlerContract>({
      async execute(query) {
        assert.ok('documentIndexId' in query)
        calls.push(`knowledgeBaseDocument:${query.documentIndexId}`)

        return null
      },
    })
  const useCase = new StartDocumentIndexPruningRetentionCommandHandler(
    documentIndexRepository,
    executionQueue,
    knowledgeBaseDocumentRetention,
  )
  const pending = useCase.execute({ documentIndexIds: ['index-c', 'index-a', 'index-b'], now })

  await firstUpdateStarted.promise
  const callsBeforeFirstUpdateFinishes = [...calls]
  finishFirstUpdate.resolve()
  await pending

  assert.deepEqual(callsBeforeFirstUpdateFinishes, [
    'lock:index-a',
    'knowledgeBaseDocument:index-a',
    'count:index-a',
    'update:start:index-a',
  ])
  assert.deepEqual(calls, [
    'lock:index-a',
    'knowledgeBaseDocument:index-a',
    'count:index-a',
    'update:start:index-a',
    'update:finish:index-a',
    'lock:index-b',
    'knowledgeBaseDocument:index-b',
    'count:index-b',
    'update:start:index-b',
    'update:finish:index-b',
    'lock:index-c',
    'knowledgeBaseDocument:index-c',
    'count:index-c',
    'update:start:index-c',
    'update:finish:index-c',
  ])
})

test('index pruning retention stops at the first failed sorted lock', async () => {
  const calls: string[] = []
  const failure = new Error('index lock failed')
  const documentIndexRepository = createRepositoryStub<DocumentIndexRepository>({
    async lockByDocumentIndexId(query) {
      calls.push(`lock:${query.documentIndexId}`)

      if (query.documentIndexId === 'index-b') throw failure

      return null
    },
  })
  const executionQueue = createRepositoryStub<DocumentIndexExecutionQueue>({
    async countIndexExecutions(query) {
      calls.push(`count:${query.documentIndexId}`)

      return 0
    },
  })
  const knowledgeBaseDocumentRetention =
    createRepositoryStub<InspectKnowledgeBaseDocumentRetentionQueryHandlerContract>({
      async execute(query) {
        assert.ok('documentIndexId' in query)
        calls.push(`knowledgeBaseDocument:${query.documentIndexId}`)

        return null
      },
    })
  const useCase = new StartDocumentIndexPruningRetentionCommandHandler(
    documentIndexRepository,
    executionQueue,
    knowledgeBaseDocumentRetention,
  )

  await assert.rejects(
    useCase.execute({ documentIndexIds: ['index-c', 'index-b', 'index-a'], now: new Date() }),
    (error: unknown) => error === failure,
  )

  assert.deepEqual(calls, ['lock:index-a', 'lock:index-b'])
})

test('index pruning retention completes an empty batch without accessing persistence', async () => {
  const documentIndexRepository = createRepositoryStub<DocumentIndexRepository>({
    async lockByDocumentIndexId() {
      assert.fail('an empty index batch must not lock indexes')
    },
    async updateByDocumentIndexIdWithLifecycleFields() {
      assert.fail('an empty index batch must not update lifecycle state')
    },
  })
  const executionQueue = createRepositoryStub<DocumentIndexExecutionQueue>({
    async countIndexExecutions() {
      assert.fail('an empty index batch must not count executions')
    },
  })
  const knowledgeBaseDocumentRetention =
    createRepositoryStub<InspectKnowledgeBaseDocumentRetentionQueryHandlerContract>({
      async execute() {
        assert.fail('an empty index batch must not inspect knowledgeBaseDocument retention')
      },
    })
  const useCase = new StartDocumentIndexPruningRetentionCommandHandler(
    documentIndexRepository,
    executionQueue,
    knowledgeBaseDocumentRetention,
  )

  await useCase.execute({ documentIndexIds: [], now: new Date() })
})
