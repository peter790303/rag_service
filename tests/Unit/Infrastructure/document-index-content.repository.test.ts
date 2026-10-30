import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DataSource, EntityManager } from 'typeorm'

import type { DocumentIndexingDeliveryDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-indexing-delivery.dto.ts'
import { DocumentIndexingDispatchedEvent } from '../../../src/DocumentIndexes/Application/Events/document-indexing-dispatched.event.ts'
import type { DocumentIndexingFailedEvent } from '../../../src/DocumentIndexes/Application/Events/document-indexing-failed.event.ts'
import { ProcessDocumentIndexListener } from '../../../src/DocumentIndexes/Application/Listeners/process-document-index.listener.ts'
import type { DocumentIndexExecutionQueue } from '../../../src/DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import { DocumentIndexModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index.model.ts'
import { DocumentIndexRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/document-index.repository.ts'
import { LoadDocumentRevisionQueryHandler } from '../../../src/DocumentRevisions/Application/Queries/load-document-revision.query.handler.ts'
import { DocumentRevision } from '../../../src/DocumentRevisions/Domain/Entities/document-revision.ts'
import { DocumentRevisionModel } from '../../../src/DocumentRevisions/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { DocumentRevisionRepository } from '../../../src/DocumentRevisions/Infrastructure/Persistence/TypeORM/Repositories/document-revision.repository.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { createMarkdownChunkPlan } from '../../Support/markdown-chunk-plan.fixture.ts'
import {
  createDocumentFixture,
  createDocumentIndexRecordFixture,
  createJobRecordFixture,
  createRepositoryStub,
  createRestoredKnowledgeBaseDocumentFixture,
} from '../Application/document-index-lifecycle.fixture.ts'

const createRevisionModel = (content: string): DocumentRevisionModel =>
  Object.assign(new DocumentRevisionModel(), {
    id: 'revision',
    documentId: 'document',
    contentSha256: 'a'.repeat(64),
    title: null,
    content,
    capturedAt: new Date('2020-01-01T00:00:00.000Z'),
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
  })

const createIndexContentProcessing = () => {
  const dataSource = new DataSource({ type: 'postgres', url: 'postgresql://unused@localhost/unused' })
  const persistenceTransaction = new PersistenceTransaction(dataSource)
  const loadDocumentRevision = new LoadDocumentRevisionQueryHandler(
    new DocumentRevisionRepository(persistenceTransaction),
  )
  const job: DocumentIndexingDeliveryDTO = {
    id: 'job',
    knowledgeBaseId: 'kb',
    documentId: 'document',
    documentIndexId: 'index',
    generation: '1',
    attempts: 1,
    leaseToken: 'lease',
    leaseExpiresAt: new Date(Date.now() + 30_000),
  }
  const plannedContent: string[] = []
  const failures: DocumentIndexingFailedEvent[] = []
  const completedJobIds: string[] = []
  const replacedJobIds: string[] = []
  const process = new ProcessDocumentIndexListener(
    {
      run: async (operation) => operation(),
      runReadOnlySnapshot: async () => assert.fail('index processing must not open a retrieval snapshot'),
    },
    { execute: async () => createDocumentFixture() },
    { execute: async () => createRestoredKnowledgeBaseDocumentFixture() },
    createRepositoryStub<DocumentIndexExecutionQueue>({
      lockExecution: async () => createJobRecordFixture(job),
      renewLease: async () => undefined,
    }),
    new DocumentIndexRepository(persistenceTransaction),
    { execute: async ({ job }) => void replacedJobIds.push(job.id) },
    { handle: async ({ jobDelivery }) => void completedJobIds.push(jobDelivery.id) },
    { handle: async (input) => void failures.push(input) },
    { modelId: 'embedding', embed: async (contents) => contents.map(() => [1, 0]) },
    {
      execute: async ({ source }) => {
        plannedContent.push(source)

        return createMarkdownChunkPlan(source)
      },
    },
    30,
    loadDocumentRevision,
  )

  return {
    process,
    job,
    plannedContent,
    failures,
    completedJobIds,
    replacedJobIds,
    documentIndexModelRepository: dataSource.getRepository(DocumentIndexModel),
    documentRevisionModelRepository: dataSource.getRepository(DocumentRevisionModel),
  }
}

test('index processing loads its declared revision through the public use case and preserves empty content', async (context) => {
  const fixture = createIndexContentProcessing()
  const index = Object.assign(new DocumentIndexModel(), createDocumentIndexRecordFixture())
  const indexRead = context.mock.method(fixture.documentIndexModelRepository, 'findOneBy', async () => index)
  const revisionRead = context.mock.method(fixture.documentRevisionModelRepository, 'findOneBy', async () =>
    createRevisionModel(''),
  )

  await fixture.process.handle(new DocumentIndexingDispatchedEvent(fixture.job))

  assert.deepEqual(fixture.plannedContent, [''])
  assert.deepEqual(fixture.failures, [])
  assert.deepEqual(fixture.replacedJobIds, [fixture.job.id])
  assert.deepEqual(fixture.completedJobIds, [fixture.job.id])
  assert.deepEqual(indexRead.mock.calls[0]?.arguments, [{ id: index.id }])
  assert.deepEqual(revisionRead.mock.calls[0]?.arguments, [{ id: index.revisionId }])
})

test('index processing records a failure when its index disappeared before loading', async (context) => {
  const fixture = createIndexContentProcessing()
  const indexRead = context.mock.method(fixture.documentIndexModelRepository, 'findOneBy', async () => null)
  const revisionRead = context.mock.method(fixture.documentRevisionModelRepository, 'findOneBy', async () =>
    createRevisionModel('must not be read'),
  )

  await fixture.process.handle(new DocumentIndexingDispatchedEvent(fixture.job))

  assert.deepEqual(indexRead.mock.calls[0]?.arguments, [{ id: fixture.job.documentIndexId }])
  assert.equal(revisionRead.mock.callCount(), 0)
  assert.deepEqual(fixture.plannedContent, [])
  assert.deepEqual(fixture.replacedJobIds, [])
  assert.deepEqual(fixture.completedJobIds, [])
  assert.equal(fixture.failures.length, 1)
  assert.deepEqual(fixture.failures[0]?.jobDelivery, fixture.job)
  assert.equal(fixture.failures[0]?.failureDecision.errorCode, 'INDEXING_FAILED')
  assert.equal(fixture.failures[0]?.failureDecision.errorMessage, 'RAG indexing failed')
})

test('index processing records a failure when the declared revision is unavailable', async (context) => {
  const fixture = createIndexContentProcessing()
  const index = Object.assign(
    new DocumentIndexModel(),
    createDocumentIndexRecordFixture({ revisionId: 'missing-revision' }),
  )
  context.mock.method(fixture.documentIndexModelRepository, 'findOneBy', async () => index)
  const revisionRead = context.mock.method(fixture.documentRevisionModelRepository, 'findOneBy', async () => null)

  await fixture.process.handle(new DocumentIndexingDispatchedEvent(fixture.job))

  assert.deepEqual(revisionRead.mock.calls[0]?.arguments, [{ id: 'missing-revision' }])
  assert.deepEqual(fixture.plannedContent, [])
  assert.deepEqual(fixture.replacedJobIds, [])
  assert.deepEqual(fixture.completedJobIds, [])
  assert.equal(fixture.failures.length, 1)
  assert.deepEqual(fixture.failures[0]?.jobDelivery, fixture.job)
  assert.equal(fixture.failures[0]?.failureDecision.errorCode, 'INDEXING_FAILED')
  assert.equal(fixture.failures[0]?.failureDecision.errorMessage, 'RAG indexing failed')
})

test('revision loading follows the current transaction manager and returns to the default manager afterward', async (context) => {
  const dataSource = new DataSource({ type: 'postgres', url: 'postgresql://unused@localhost/unused' })
  const persistenceTransaction = new PersistenceTransaction(dataSource)
  const loadRevision = new LoadDocumentRevisionQueryHandler(new DocumentRevisionRepository(persistenceTransaction))
  const defaultRead = context.mock.method(dataSource.getRepository(DocumentRevisionModel), 'findOneBy', async () =>
    createRevisionModel('committed content'),
  )
  const transactionManager = new EntityManager(dataSource)
  const transactionRead = context.mock.method(
    transactionManager.getRepository(DocumentRevisionModel),
    'findOneBy',
    async () => createRevisionModel('transaction content'),
  )

  const revision = await persistenceTransaction.bind(transactionManager, () =>
    loadRevision.execute({ revisionId: 'revision' }),
  )

  assert.ok(revision instanceof DocumentRevision)
  assert.equal(revision.content, 'transaction content')
  assert.deepEqual(transactionRead.mock.calls[0]?.arguments, [{ id: 'revision' }])
  assert.equal(defaultRead.mock.callCount(), 0)
  assert.equal((await loadRevision.execute({ revisionId: 'revision' }))?.content, 'committed content')
  assert.equal(defaultRead.mock.callCount(), 1)
})
