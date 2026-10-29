import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { concatMap, firstValueFrom, from, toArray } from 'rxjs'

import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { ChunkPlanningProvider } from '../../../src/Application/Chunks/Contracts/chunk-planning-provider.ts'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/Chunks/UseCases/replace-index-chunk.use-case.ts'
import { WriteRequestDocumentIndexesAssembler } from '../../../src/Application/DocumentIndexes/Assemblers/write-request-document-indexes.assembler.ts'
import { DocumentIndexingTargetStateEnum } from '../../../src/Application/DocumentIndexes/Enums/document-indexing-target-state.enum.ts'
import { DocumentIndexingDispatchedEvent } from '../../../src/Application/DocumentIndexes/Events/document-indexing-dispatched.event.ts'
import { DocumentIndexingRequestedEvent } from '../../../src/Application/DocumentIndexes/Events/document-indexing-requested.event.ts'
import { DocumentIndexingNotFoundException } from '../../../src/Application/DocumentIndexes/Exceptions/document-indexing-not-found.exception.ts'
import { IndexRetrySourceChangedException } from '../../../src/Application/DocumentIndexes/Exceptions/index-retry-source-changed.exception.ts'
import { InvalidIndexRetrySourceContextException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-index-retry-source-context.exception.ts'
import { StaleDocumentIndexingFailureException } from '../../../src/Application/DocumentIndexes/Exceptions/stale-document-indexing-failure.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { DispatchDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/dispatch-document-indexing.listener.ts'
import { DocumentIndexedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexed.listener.ts'
import { DocumentIndexingFailedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexing-failed.listener.ts'
import { DocumentIndexingRequestedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexing-requested.listener.ts'
import { ProcessDocumentIndexListener } from '../../../src/Application/DocumentIndexes/Listeners/process-document-index.listener.ts'
import { RetryDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/retry-document-indexing.listener.ts'
import { AuthorizeDocumentIndexChunkReplacementUseCase } from '../../../src/Application/DocumentIndexes/UseCases/authorize-document-index-chunk-replacement.use-case.ts'
import { StartDocumentIndexPruningRetentionUseCase } from '../../../src/Application/DocumentIndexes/UseCases/start-document-index-pruning-retention.use-case.ts'
import { ReplacePlannedDocumentRelationsUseCase } from '../../../src/Application/DocumentRelations/UseCases/replace-planned-document-relations.use-case.ts'
import type { GetDocumentRevisionForIndexRetryUseCaseContract } from '../../../src/Application/DocumentRevisions/Contracts/get-document-revision-for-index-retry.use-case.contract.ts'
import { GetDocumentRevisionForIndexRetryUseCase } from '../../../src/Application/DocumentRevisions/UseCases/get-document-revision-for-index-retry.use-case.ts'
import { LoadDocumentRevisionUseCase } from '../../../src/Application/DocumentRevisions/UseCases/load-document-revision.use-case.ts'
import { PrepareDocumentRevisionForIndexRequestUseCase } from '../../../src/Application/DocumentRevisions/UseCases/prepare-document-revision-for-index-request.use-case.ts'
import { GetDocumentForIndexRetryUseCase } from '../../../src/Application/Documents/UseCases/get-document-for-index-retry.use-case.ts'
import { PrepareDocumentForIndexRequestUseCase } from '../../../src/Application/Documents/UseCases/prepare-document-for-index-request.use-case.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import { ActivateKnowledgeBaseDocumentIndexUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/activate-knowledge-base-document-index.use-case.ts'
import { CompleteKnowledgeBaseDocumentIndexingUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/complete-knowledge-base-document-indexing.use-case.ts'
import { GetKnowledgeBaseDocumentIndexingStateUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/get-knowledge-base-document-indexing-state.use-case.ts'
import { InspectKnowledgeBaseDocumentRetentionUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/inspect-knowledge-base-document-retention.use-case.ts'
import { PrepareKnowledgeBaseDocumentForIndexRequestUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/prepare-knowledge-base-document-for-index-request.use-case.ts'
import { ReserveKnowledgeBaseDocumentForIndexingUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/reserve-knowledge-base-document-for-indexing.use-case.ts'
import { SaveKnowledgeBaseDocumentIndexRequestUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/save-knowledge-base-document-index-request.use-case.ts'
import { EmbeddingProvider } from '../../../src/Application/KnowledgeBases/Contracts/embedding-provider.ts'
import { EnsureIndexingKnowledgeBaseUseCase } from '../../../src/Application/KnowledgeBases/UseCases/ensure-indexing-knowledge-base.use-case.ts'
import { GetIndexingKnowledgeBaseUseCase } from '../../../src/Application/KnowledgeBases/UseCases/get-indexing-knowledge-base.use-case.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { ChunkModel } from '../../../src/Infrastructure/Persistence/Models/chunk.model.ts'
import { DocumentIndexSuccessReceiptModel } from '../../../src/Infrastructure/Persistence/Models/document-index-success-receipt.model.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { FailedJobModel } from '../../../src/Infrastructure/Persistence/Models/failed-job.model.ts'
import { JobModel } from '../../../src/Infrastructure/Persistence/Models/job.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { ChunkRepository } from '../../../src/Infrastructure/Persistence/Repositories/chunk.repository.ts'
import { DocumentIndexSuccessReceiptRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index-success-receipt.repository.ts'
import { DocumentIndexRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index.repository.ts'
import { DocumentRelationRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-relation.repository.ts'
import { DocumentRevisionRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-revision.repository.ts'
import { DocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/document.repository.ts'
import { FailedJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../../src/Infrastructure/Persistence/Repositories/job.repository.ts'
import { KnowledgeBaseDocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base-document.repository.ts'
import { KnowledgeBaseRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base.repository.ts'
import { RetryFailedJobsCommand } from '../../../src/Interfaces/Console/Commands/retry-failed-jobs-command.ts'
import { DocumentIndexPersistenceFixture } from '../../Support/document-index-persistence.fixture.ts'
import { createMarkdownChunkPlan } from '../../Support/markdown-chunk-plan.fixture.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

const config: KnowledgeServiceConfig = {
  port: 30700,
  databaseUrl: 'postgres://unused',
  databaseSchema: 'public',
  embeddingModel: 'integration-test-model',
  embeddingDimensions: 384,
  embeddingTransport: 'http',
  embeddingRevision: '',
  embeddingCacheDir: '/unused',
  embeddingApiUrl: 'https://unused.invalid',
  chunkingTransport: 'http',
  chunkingCliPath: 'codex',
  chunkingCliMaxOutputBytes: 4194304,
  chunkingModel: 'integration-test-chunker',
  chunkingApiUrl: 'https://unused.invalid',
  workerPollMs: 1000,
  gcPollMs: 60000,
  gcRetentionMs: 86400000,
  workerLeaseSeconds: 30,
  externalRequestTimeoutMs: 30000,
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
      new KnowledgeBaseDocumentRepository(persistenceTransaction),
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
      new PrepareKnowledgeBaseDocumentForIndexRequestUseCase(
        documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
      ),
      new PrepareDocumentRevisionForIndexRequestUseCase(documentIndexPersistenceFixture.documentRevisionRepository),
      documentIndexPersistenceFixture.documentIndexRepository,
      documentIndexPersistenceFixture.jobRepository,
      documentIndexPersistenceFixture.failedJobRepository,
      pipelineSettings,
      writeRequestDocumentIndexesAssembler,
      new SaveKnowledgeBaseDocumentIndexRequestUseCase(documentIndexPersistenceFixture.knowledgeBaseDocumentRepository),
      new StartDocumentIndexPruningRetentionUseCase(
        documentIndexPersistenceFixture.documentIndexRepository,
        documentIndexPersistenceFixture.jobRepository,
        new InspectKnowledgeBaseDocumentRetentionUseCase(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
      ),
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
      new ReserveKnowledgeBaseDocumentForIndexingUseCase(
        documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
      ),
      documentIndexPersistenceFixture.documentIndexRepository,
      documentIndexPersistenceFixture.jobRepository,
      documentIndexPersistenceFixture.failedJobRepository,
      config.workerLeaseSeconds,
      new ActivateKnowledgeBaseDocumentIndexUseCase(documentIndexPersistenceFixture.knowledgeBaseDocumentRepository),
      new GetIndexingKnowledgeBaseUseCase(documentIndexPersistenceFixture.knowledgeBaseRepository),
      new DocumentIndexSuccessReceiptRepository(documentIndexPersistenceFixture.persistenceTransaction),
    )
    const failJob = new DocumentIndexingFailedListener(
      documentIndexPersistenceFixture.persistenceTransaction,
      new ReserveDocumentForIndexingUseCase(documentIndexPersistenceFixture.documentRepository),
      new ReserveKnowledgeBaseDocumentForIndexingUseCase(
        documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
      ),
      documentIndexPersistenceFixture.jobRepository,
      documentIndexPersistenceFixture.documentIndexRepository,
      documentIndexPersistenceFixture.failedJobRepository,
    )
    await firstValueFrom(
      from([1, 2, 3, 4]).pipe(
        concatMap(async (attempt) => {
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
        }),
        toArray(),
      ),
    )
    assert.equal(await jobModelRepository.count(), 0)
    const archive = await failedJobModelRepository.findOneByOrFail({ jobId: originalJob.id })
    assert.equal(archive.attempts, 4)
    assert.deepEqual(archive.retryPayload.input, context)

    const retryRevisionReader = new GetDocumentRevisionForIndexRetryUseCase(
      documentIndexPersistenceFixture.documentRevisionRepository,
    )

    return {
      cleanup,
      persistenceFixture: documentIndexPersistenceFixture,
      claimNext,
      chunks: dataSource.getRepository(ChunkModel),
      documents: dataSource.getRepository(DocumentModel),
      receipts: dataSource.getRepository(DocumentIndexSuccessReceiptModel),
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
        new GetKnowledgeBaseDocumentIndexingStateUseCase(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
        createRetryRevisionReader?.(persistenceTransaction, retryRevisionReader) ?? retryRevisionReader,
        documentIndexPersistenceFixture.documentIndexRepository,
        documentIndexPersistenceFixture.jobRepository,
        documentIndexPersistenceFixture.failedJobRepository,
        { modelId: config.embeddingModel, embed: async () => [] },
        config,
        writeRequestDocumentIndexesAssembler,
        new ReserveDocumentForIndexingUseCase(documentIndexPersistenceFixture.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingUseCase(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
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
    await firstValueFrom(
      from([
        { name: 'nonempty context', context: { source: 'repository', metadata: { tags: ['guide'] } } },
        { name: 'context containing a payload property', context: { source: 'repository', payload: 'metadata value' } },
      ]).pipe(
        concatMap(async ({ name, context }) => {
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
              assert.equal(retriedJob.retryOfFailedJobId, null)
              assert.equal(retriedJob.leaseToken, null)
              assert.equal(retriedJob.reservedAt, null)
              assert.equal(retriedJob.executionVerification, null)
              assert.equal(retriedJob.executionState, null)
              assert.equal(
                await archivedDocumentIndexRequestFixture.failedJobs.findOneBy({
                  id: archivedDocumentIndexRequestFixture.archive.id,
                }),
                null,
              )
              await assert.rejects(
                archivedDocumentIndexRequestFixture.retry.handle({
                  projectId: archivedDocumentIndexRequestFixture.projectId,
                  failedJobId: archivedDocumentIndexRequestFixture.archive.id,
                }),
                DocumentIndexingNotFoundException,
              )
              assert.equal(await archivedDocumentIndexRequestFixture.jobs.count(), 1)
            } finally {
              await archivedDocumentIndexRequestFixture.cleanup()
            }
          })
        }),
        toArray(),
      ),
    )
  },
)

test(
  'retry failed jobs command queues an eligible failure once and reports it skipped on the next run',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const fixture = await createArchivedRequest({ source: 'repository' })

    try {
      const command = new RetryFailedJobsCommand(fixture.retry)
      const outsideProject = await command.execute({ projectId: `${fixture.projectId}-other` })

      assert.equal(outsideProject.queued.length, 0)
      assert.equal(outsideProject.skipped.length, 0)
      assert.equal(outsideProject.failures.length, 0)
      assert.equal((await fixture.failedJobs.findOneByOrFail({ id: fixture.archive.id })).retriedAt, null)
      assert.equal(await fixture.jobs.count(), 0)

      const queued = await command.execute({ projectId: fixture.projectId })

      assert.equal(queued.queued.length, 1)
      assert.equal(queued.skipped.length, 0)
      assert.equal(queued.failures.length, 0)
      assert.equal(queued.queued[0]?.failedJobId, fixture.archive.id)
      const queuedJob = await fixture.jobs.findOneByOrFail({ id: queued.queued[0]!.jobId })
      assert.equal(queuedJob.status, DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED)
      assert.equal(queuedJob.retryOfFailedJobId, null)
      assert.equal(await fixture.failedJobs.findOneBy({ id: fixture.archive.id }), null)
      assert.equal(await fixture.jobs.count(), 1)

      const duplicate = await command.execute({ failedJobId: fixture.archive.id })

      assert.equal(duplicate.queued.length, 0)
      assert.equal(duplicate.failures.length, 0)
      assert.equal(duplicate.skipped.length, 1)
      assert.equal(duplicate.skipped[0]?.failedJobId, fixture.archive.id)
      assert.equal(await fixture.jobs.count(), 1)
    } finally {
      await fixture.cleanup()
    }
  },
)

test(
  'retry removes the failed job only when enqueue and archive removal commit together',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const fixture = await createArchivedRequest({ source: 'repository' })

    try {
      fixture.persistenceFixture.failedJobRepository.removeFailure = async () => {
        throw new Error('failure archive removal failed')
      }

      await assert.rejects(
        fixture.retry.handle({ projectId: fixture.projectId, failedJobId: fixture.archive.id }),
        /failure archive removal failed/,
      )

      assert.equal(await fixture.jobs.count(), 0)
      assert.equal((await fixture.failedJobs.findOneByOrFail({ id: fixture.archive.id })).retriedAt, null)
    } finally {
      await fixture.cleanup()
    }
  },
)

test(
  'manual retry runs through the process listener and persists chunks and vectors before READY',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const fixture = await createArchivedRequest({ source: 'repository' })

    try {
      const retry = await fixture.retry.handle({ projectId: fixture.projectId, failedJobId: fixture.archive.id })
      assert.equal(retry.status, DocumentIndexingTargetStateEnum.QUEUED)
      assert.ok(retry.jobId)

      const claim = await fixture.claimNext.handle()
      assert.ok(claim)
      assert.equal(claim.id, retry.jobId)

      const persistenceFixture = fixture.persistenceFixture
      const reserveDocument = new ReserveDocumentForIndexingUseCase(persistenceFixture.documentRepository)
      const reserveMembership = new ReserveKnowledgeBaseDocumentForIndexingUseCase(
        persistenceFixture.knowledgeBaseDocumentRepository,
      )
      const completeJob = new DocumentIndexedListener(
        persistenceFixture.persistenceTransaction,
        reserveDocument,
        reserveMembership,
        persistenceFixture.jobRepository,
        persistenceFixture.documentIndexRepository,
        new CompleteKnowledgeBaseDocumentIndexingUseCase(persistenceFixture.knowledgeBaseDocumentRepository),
        new GetIndexingKnowledgeBaseUseCase(persistenceFixture.knowledgeBaseRepository),
        new DocumentIndexSuccessReceiptRepository(persistenceFixture.persistenceTransaction),
      )
      const planner = {
        modelId: config.chunkingModel,
        plan: async (content: string) => createMarkdownChunkPlan(content),
      } as ChunkPlanningProvider
      const embeddings = {
        modelId: config.embeddingModel,
        embed: async (contents: string[]) =>
          contents.map((_, ordinal) =>
            Array.from({ length: config.embeddingDimensions }, (_unused, dimension) => (dimension === ordinal ? 1 : 0)),
          ),
      } as EmbeddingProvider
      const process = new ProcessDocumentIndexListener(
        persistenceFixture.persistenceTransaction,
        reserveDocument,
        reserveMembership,
        persistenceFixture.jobRepository,
        persistenceFixture.documentIndexRepository,
        new ReplaceIndexChunkUseCase(
          persistenceFixture.persistenceTransaction,
          new AuthorizeDocumentIndexChunkReplacementUseCase(
            reserveDocument,
            reserveMembership,
            persistenceFixture.jobRepository,
            persistenceFixture.documentIndexRepository,
          ),
          persistenceFixture.chunkRepository,
          new ReplacePlannedDocumentRelationsUseCase(persistenceFixture.documentRelationRepository),
        ),
        completeJob,
        new DocumentIndexingFailedListener(
          persistenceFixture.persistenceTransaction,
          reserveDocument,
          reserveMembership,
          persistenceFixture.jobRepository,
          persistenceFixture.documentIndexRepository,
          persistenceFixture.failedJobRepository,
        ),
        embeddings,
        planner,
        config.workerLeaseSeconds,
        new LoadDocumentRevisionUseCase(persistenceFixture.documentRevisionRepository),
      )

      await process.handle(new DocumentIndexingDispatchedEvent(claim))

      const chunks = await fixture.chunks.findBy({ documentIndexId: fixture.originalJob.documentIndexId })
      assert.ok(chunks.length > 0)
      assert.ok(chunks.every((chunk) => chunk.embedding.length === config.embeddingDimensions))
      assert.ok(chunks.every((chunk) => chunk.embedding.every(Number.isFinite)))

      const index = await fixture.indexes.findOneByOrFail({ id: fixture.originalJob.documentIndexId })
      assert.equal(index.status, DocumentIndexStatusEnum.READY)

      const receipt = await fixture.receipts.findOneByOrFail({ jobId: retry.jobId })
      assert.equal(receipt.documentIndexId, fixture.originalJob.documentIndexId)
      assert.equal(await fixture.jobs.countBy({ id: retry.jobId }), 0)
    } finally {
      await fixture.cleanup()
    }
  },
)

test(
  'persisted manual retry rejects context drift, source drift and invalid archived input',
  {
    skip: !process.env.RAG_DATABASE_URL,
  },
  async (t) => {
    await firstValueFrom(
      from(['context drift', 'source drift', 'invalid archived input']).pipe(
        concatMap(async (name) => {
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
        }),
        toArray(),
      ),
    )
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
