import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { WriteRequestDocumentIndexesAssembler } from '../../../src/Application/DocumentIndexes/Assemblers/write-request-document-indexes.assembler.ts'
import { DocumentIndexingTargetStateEnum } from '../../../src/Application/DocumentIndexes/Enums/document-indexing-target-state.enum.ts'
import { DocumentIndexingRequestedEvent } from '../../../src/Application/DocumentIndexes/Events/document-indexing-requested.event.ts'
import { DocumentIndexingFailureAlreadyRetriedException } from '../../../src/Application/DocumentIndexes/Exceptions/document-indexing-failure-already-retried.exception.ts'
import { IndexRetrySourceChangedException } from '../../../src/Application/DocumentIndexes/Exceptions/index-retry-source-changed.exception.ts'
import { InvalidIndexRetrySourceContextException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-index-retry-source-context.exception.ts'
import { StaleDocumentIndexingFailureException } from '../../../src/Application/DocumentIndexes/Exceptions/stale-document-indexing-failure.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { DispatchDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/dispatch-document-indexing.listener.ts'
import { DocumentIndexingFailedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexing-failed.listener.ts'
import { DocumentIndexingRequestedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexing-requested.listener.ts'
import { RetryDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/retry-document-indexing.listener.ts'
import type { GetDocumentRevisionForIndexRetryUseCaseContract } from '../../../src/Application/DocumentRevisions/Contracts/get-document-revision-for-index-retry.use-case.contract.ts'
import { GetDocumentRevisionForIndexRetryUseCase } from '../../../src/Application/DocumentRevisions/UseCases/get-document-revision-for-index-retry.use-case.ts'
import { PrepareDocumentRevisionForIndexRequestUseCase } from '../../../src/Application/DocumentRevisions/UseCases/prepare-document-revision-for-index-request.use-case.ts'
import { GetDocumentForIndexRetryUseCase } from '../../../src/Application/Documents/UseCases/get-document-for-index-retry.use-case.ts'
import { PrepareDocumentForIndexRequestUseCase } from '../../../src/Application/Documents/UseCases/prepare-document-for-index-request.use-case.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import { EnsureIndexingKnowledgeBaseUseCase } from '../../../src/Application/KnowledgeBases/UseCases/ensure-indexing-knowledge-base.use-case.ts'
import { GetIndexingKnowledgeBaseUseCase } from '../../../src/Application/KnowledgeBases/UseCases/get-indexing-knowledge-base.use-case.ts'
import { ActivateMembershipIndexUseCase } from '../../../src/Application/Memberships/UseCases/activate-membership-index.use-case.ts'
import { GetMembershipIndexingStateUseCase } from '../../../src/Application/Memberships/UseCases/get-membership-indexing-state.use-case.ts'
import { PrepareMembershipForIndexRequestUseCase } from '../../../src/Application/Memberships/UseCases/prepare-membership-for-index-request.use-case.ts'
import { ReserveMembershipForIndexingUseCase } from '../../../src/Application/Memberships/UseCases/reserve-membership-for-indexing.use-case.ts'
import { SaveMembershipIndexRequestUseCase } from '../../../src/Application/Memberships/UseCases/save-membership-index-request.use-case.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { FailedJobModel } from '../../../src/Infrastructure/Persistence/Models/failed-job.model.ts'
import { JobModel } from '../../../src/Infrastructure/Persistence/Models/job.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { ChunkRepository } from '../../../src/Infrastructure/Persistence/Repositories/chunk.repository.ts'
import { DocumentIndexRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index.repository.ts'
import { DocumentRelationRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-relation.repository.ts'
import { DocumentRevisionRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-revision.repository.ts'
import { DocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/document.repository.ts'
import { FailedJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../../src/Infrastructure/Persistence/Repositories/job.repository.ts'
import { KnowledgeBaseDocumentMembershipRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base-document-membership.repository.ts'
import { KnowledgeBaseRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base.repository.ts'
import { DocumentIndexPersistenceFixture } from '../../Support/document-index-persistence.fixture.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

const config: KnowledgeServiceConfig = {
  port: 30700,
  databaseUrl: 'postgres://unused',
  databaseSchema: 'public',
  embeddingModel: 'integration-test-model',
  embeddingDimensions: 384,
  embeddingApiUrl: 'https://unused.invalid',
  chunkingModel: 'integration-test-chunker',
  chunkingApiUrl: 'https://unused.invalid',
  workerPollMs: 1000,
  gcPollMs: 60000,
  gcRetentionMs: 86400000,
  workerLeaseSeconds: 30,
  serviceAuthSecret: 'integration-test-secret',
}

const createArchivedRequest = async (
  context: Record<string, unknown>,
  createRetryRevisionReader?: (
    transaction: PersistenceTransaction,
    reader: GetDocumentRevisionForIndexRetryUseCaseContract,
  ) => GetDocumentRevisionForIndexRetryUseCaseContract,
) => {
  const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()
  const persistenceTransaction = new PersistenceTransaction(dataSource)

  try {
    const documentIndexModelRepository = dataSource.getRepository(DocumentIndexModel)
    const jobModelRepository = dataSource.getRepository(JobModel)
    const failedJobModelRepository = dataSource.getRepository(FailedJobModel)
    const documentRevisionModelRepository = dataSource.getRepository(DocumentRevisionModel)
    const documentIndexPersistenceFixture = new DocumentIndexPersistenceFixture(
      persistenceTransaction,
      new JobRepository(persistenceTransaction),
      new KnowledgeBaseDocumentMembershipRepository(persistenceTransaction),
      new DocumentIndexRepository(persistenceTransaction),
      new KnowledgeBaseRepository(persistenceTransaction),
      new DocumentRepository(persistenceTransaction),
      new DocumentRevisionRepository(persistenceTransaction),
      new FailedJobRepository(persistenceTransaction),
      new ChunkRepository(persistenceTransaction, retrievalDataSource),
      new DocumentRelationRepository(persistenceTransaction),
    )
    const pipelineSettings = {
      embeddingModel: config.embeddingModel,
      embeddingDimensions: config.embeddingDimensions,
      chunkingModel: config.chunkingModel,
      chunkingProfile: 'integration-chunks',
      embeddingProfile: 'integration-embeddings',
      lexicalProfile: 'integration-lexical',
      relationProfile: 'integration-relations',
    }
    const writeRequestDocumentIndexesAssembler = new WriteRequestDocumentIndexesAssembler(pipelineSettings)
    const projectId = `context-project-${randomUUID()}`
    const request = await new DocumentIndexingRequestedListener(
      documentIndexPersistenceFixture.persistenceTransaction,
      new EnsureIndexingKnowledgeBaseUseCase(documentIndexPersistenceFixture.knowledgeBaseRepository),
      new PrepareDocumentForIndexRequestUseCase(documentIndexPersistenceFixture.documentRepository),
      new PrepareMembershipForIndexRequestUseCase(documentIndexPersistenceFixture.membershipRepository),
      new PrepareDocumentRevisionForIndexRequestUseCase(documentIndexPersistenceFixture.documentRevisionRepository),
      documentIndexPersistenceFixture.documentIndexRepository,
      documentIndexPersistenceFixture.jobRepository,
      documentIndexPersistenceFixture.failedJobRepository,
      pipelineSettings,
      writeRequestDocumentIndexesAssembler,
      new SaveMembershipIndexRequestUseCase(documentIndexPersistenceFixture.membershipRepository),
    ).handle(
      new DocumentIndexingRequestedEvent({
        knowledgeBaseId: randomUUID(),
        projectId,
        projectName: 'Retry context regression',
        sourceType: DocumentSourceTypeEnum.REPOSITORY,
        sourceKey: randomUUID(),
        sourcePath: 'docs/retry-context.md',
        content: '# Retry context\n\nA persisted request must keep its exact source context.',
        payload: context,
      }),
    )
    assert.ok(request.jobId)
    const originalJob = await jobModelRepository.findOneByOrFail({ id: request.jobId })
    assert.deepEqual(originalJob.payload, context)
    const claimNext = new DispatchDocumentIndexingListener(
      documentIndexPersistenceFixture.persistenceTransaction,
      new ReserveDocumentForIndexingUseCase(documentIndexPersistenceFixture.documentRepository),
      new ReserveMembershipForIndexingUseCase(documentIndexPersistenceFixture.membershipRepository),
      documentIndexPersistenceFixture.documentIndexRepository,
      documentIndexPersistenceFixture.jobRepository,
      documentIndexPersistenceFixture.failedJobRepository,
      config.workerLeaseSeconds,
      new ActivateMembershipIndexUseCase(documentIndexPersistenceFixture.membershipRepository),
    )
    const failJob = new DocumentIndexingFailedListener(
      documentIndexPersistenceFixture.persistenceTransaction,
      new ReserveDocumentForIndexingUseCase(documentIndexPersistenceFixture.documentRepository),
      new ReserveMembershipForIndexingUseCase(documentIndexPersistenceFixture.membershipRepository),
      documentIndexPersistenceFixture.jobRepository,
      documentIndexPersistenceFixture.documentIndexRepository,
      documentIndexPersistenceFixture.failedJobRepository,
    )
    await [1, 2, 3, 4].reduce(async (previousFailure, attempt) => {
      await previousFailure
      const claim = await claimNext.handle()
      assert.ok(claim)
      assert.equal(claim.id, originalJob.id)
      assert.equal(claim.attempts, attempt)
      const failedAt = new Date(Date.now() - 60_000)
      await failJob.handle({
        jobDelivery: claim,
        failureDecision: {
          errorCode: 'CONTEXT_TEST_FAILURE',
          errorMessage: `Attempt ${attempt} failed`,
          failedAt,
          retryAt: attempt < 4 ? failedAt : null,
        },
      })
    }, Promise.resolve())
    assert.equal(await jobModelRepository.count(), 0)
    const archive = await failedJobModelRepository.findOneByOrFail({ jobId: originalJob.id })
    assert.equal(archive.attempts, 4)
    assert.deepEqual(archive.retryPayload.input, context)

    const retryRevisionReader = new GetDocumentRevisionForIndexRetryUseCase(
      documentIndexPersistenceFixture.documentRevisionRepository,
    )

    return {
      cleanup,
      documents: dataSource.getRepository(DocumentModel),
      jobs: jobModelRepository,
      indexes: documentIndexModelRepository,
      revisions: documentRevisionModelRepository,
      failedJobs: failedJobModelRepository,
      originalJob,
      archive,
      projectId,
      retry: new RetryDocumentIndexingListener(
        documentIndexPersistenceFixture.persistenceTransaction,
        new GetIndexingKnowledgeBaseUseCase(documentIndexPersistenceFixture.knowledgeBaseRepository),
        new GetDocumentForIndexRetryUseCase(documentIndexPersistenceFixture.documentRepository),
        new GetMembershipIndexingStateUseCase(documentIndexPersistenceFixture.membershipRepository),
        createRetryRevisionReader?.(persistenceTransaction, retryRevisionReader) ?? retryRevisionReader,
        documentIndexPersistenceFixture.documentIndexRepository,
        documentIndexPersistenceFixture.jobRepository,
        documentIndexPersistenceFixture.failedJobRepository,
        { modelId: config.embeddingModel, embed: async () => [] },
        config,
        writeRequestDocumentIndexesAssembler,
        new ReserveDocumentForIndexingUseCase(documentIndexPersistenceFixture.documentRepository),
        new ReserveMembershipForIndexingUseCase(documentIndexPersistenceFixture.membershipRepository),
      ),
    }
  } catch (error) {
    await cleanup()

    throw error
  }
}

test(
  'persisted request → terminal archive → manual retry preserves the source context',
  {
    skip: !process.env.RAG_DATABASE_URL,
  },
  async (t) => {
    await [
      { name: 'nonempty context', context: { source: 'repository', metadata: { tags: ['guide'] } } },
      { name: 'context containing a payload property', context: { source: 'repository', payload: 'metadata value' } },
    ].reduce(async (previousCase, { name, context }) => {
      await previousCase
      await t.test(name, async () => {
        const archivedDocumentIndexRequestFixture = await createArchivedRequest(context)

        try {
          const result = await archivedDocumentIndexRequestFixture.retry.handle({
            projectId: archivedDocumentIndexRequestFixture.projectId,
            failedJobId: archivedDocumentIndexRequestFixture.archive.id,
          })
          assert.equal(result.status, DocumentIndexingTargetStateEnum.QUEUED)
          assert.equal(typeof result.jobId, 'string')
          assert.ok(result.jobId)
          assert.notEqual(result.jobId, archivedDocumentIndexRequestFixture.originalJob.id)
          assert.notEqual(result.jobId, archivedDocumentIndexRequestFixture.archive.id)
          const retriedJob = await archivedDocumentIndexRequestFixture.jobs.findOneByOrFail({ id: result.jobId })
          assert.deepEqual(retriedJob.payload, context)
          assert.equal(retriedJob.status, DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED)
          assert.equal(retriedJob.attempts, 0)
          assert.equal(retriedJob.documentIndexId, archivedDocumentIndexRequestFixture.originalJob.documentIndexId)
          assert.equal(retriedJob.generation, archivedDocumentIndexRequestFixture.originalJob.generation)
          assert.equal(retriedJob.retryOfFailedJobId, archivedDocumentIndexRequestFixture.archive.id)
          assert.equal(retriedJob.leaseToken, null)
          assert.equal(retriedJob.reservedAt, null)
          assert.equal(retriedJob.executionVerification, null)
          assert.equal(retriedJob.executionState, null)
          const consumedArchive = await archivedDocumentIndexRequestFixture.failedJobs.findOneByOrFail({
            id: archivedDocumentIndexRequestFixture.archive.id,
          })
          assert.ok(consumedArchive.retriedAt)
          assert.deepEqual(consumedArchive.retryPayload, archivedDocumentIndexRequestFixture.archive.retryPayload)
          await assert.rejects(
            archivedDocumentIndexRequestFixture.retry.handle({
              projectId: archivedDocumentIndexRequestFixture.projectId,
              failedJobId: archivedDocumentIndexRequestFixture.archive.id,
            }),
            DocumentIndexingFailureAlreadyRetriedException,
          )
          assert.equal(await archivedDocumentIndexRequestFixture.jobs.count(), 1)
        } finally {
          await archivedDocumentIndexRequestFixture.cleanup()
        }
      })
    }, Promise.resolve())
  },
)

test(
  'persisted manual retry rejects context drift, source drift and invalid archived input',
  {
    skip: !process.env.RAG_DATABASE_URL,
  },
  async (t) => {
    await ['context drift', 'source drift', 'invalid archived input'].reduce(async (previousCase, name) => {
      await previousCase
      await t.test(name, async () => {
        const archivedDocumentIndexRequestFixture = await createArchivedRequest({
          source: 'repository',
          payload: 'metadata value',
        })

        try {
          if (name === 'source drift') {
            const index = await archivedDocumentIndexRequestFixture.indexes.findOneByOrFail({
              id: archivedDocumentIndexRequestFixture.archive.documentIndexId,
            })
            await archivedDocumentIndexRequestFixture.revisions.update(index.revisionId, {
              content: 'Changed source content',
            })
          } else {
            await archivedDocumentIndexRequestFixture.failedJobs.update(
              archivedDocumentIndexRequestFixture.archive.id,
              {
                retryPayload: {
                  ...archivedDocumentIndexRequestFixture.archive.retryPayload,
                  input: name === 'context drift' ? { source: 'changed context' } : ['invalid context'],
                },
              },
            )
          }

          await assert.rejects(
            archivedDocumentIndexRequestFixture.retry.handle({
              projectId: archivedDocumentIndexRequestFixture.projectId,
              failedJobId: archivedDocumentIndexRequestFixture.archive.id,
            }),
            name === 'invalid archived input'
              ? InvalidIndexRetrySourceContextException
              : StaleDocumentIndexingFailureException,
          )
          assert.equal(await archivedDocumentIndexRequestFixture.jobs.count(), 0)
          assert.equal(
            (
              await archivedDocumentIndexRequestFixture.failedJobs.findOneByOrFail({
                id: archivedDocumentIndexRequestFixture.archive.id,
              })
            ).retriedAt,
            null,
          )
        } finally {
          await archivedDocumentIndexRequestFixture.cleanup()
        }
      })
    }, Promise.resolve())
  },
)

test(
  'persisted retry rolls back a sentinel write when the locked revision disappears',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    let revisionReads = 0
    let sentinelObservedInTransaction = false
    const sentinelTitle = 'Retry rollback sentinel'
    const fixture = await createArchivedRequest({ source: 'repository' }, (transaction, reader) => ({
      execute: async (query) => {
        revisionReads += 1

        if (revisionReads !== 3) return reader.execute(query)

        assert.equal(transaction.manager.queryRunner?.isTransactionActive, true)
        const documents = transaction.manager.getRepository(DocumentModel)
        await documents.update(query.documentId, { currentTitle: sentinelTitle })
        const document = await documents.findOneByOrFail({ id: query.documentId })
        assert.equal(document.currentTitle, sentinelTitle)
        sentinelObservedInTransaction = true

        return null
      },
    }))

    try {
      const originalDocument = await fixture.documents.findOneByOrFail({ id: fixture.originalJob.documentId })
      assert.notEqual(originalDocument.currentTitle, sentinelTitle)

      await assert.rejects(
        fixture.retry.handle({ projectId: fixture.projectId, failedJobId: fixture.archive.id }),
        (error: unknown) => {
          assert.ok(error instanceof IndexRetrySourceChangedException)
          assert.equal(error.code, 'INDEX_RETRY_SOURCE_CHANGED')

          return true
        },
      )

      assert.equal(revisionReads, 3)
      assert.equal(sentinelObservedInTransaction, true)
      assert.equal(
        (await fixture.documents.findOneByOrFail({ id: originalDocument.id })).currentTitle,
        originalDocument.currentTitle,
      )
      assert.equal(await fixture.jobs.count(), 0)
      assert.equal((await fixture.failedJobs.findOneByOrFail({ id: fixture.archive.id })).retriedAt, null)
    } finally {
      await fixture.cleanup()
    }
  },
)
