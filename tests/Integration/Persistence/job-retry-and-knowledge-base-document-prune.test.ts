import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { WriteRequestDocumentIndexesAssembler } from '../../../src/DocumentIndexes/Application/Assemblers/write-request-document-indexes.assembler.ts'
import { CollectDocumentIndexGarbageCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/collect-document-index-garbage.command.handler.ts'
import { CollectIndexChunkGarbageCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/collect-index-chunk-garbage.command.handler.ts'
import { StartDocumentIndexPruningRetentionCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/start-document-index-pruning-retention.command.handler.ts'
import { DocumentIndexingNotFoundException } from '../../../src/DocumentIndexes/Application/Exceptions/document-indexing-not-found.exception.ts'
import { IndexRetrySourceChangedException } from '../../../src/DocumentIndexes/Application/Exceptions/index-retry-source-changed.exception.ts'
import { StaleDocumentIndexingFailureException } from '../../../src/DocumentIndexes/Application/Exceptions/stale-document-indexing-failure.exception.ts'
import {
  DocumentIndexExecutionLifecycle as RagJobEntity,
  DOCUMENT_INDEX_EXECUTION_STATUS,
} from '../../../src/DocumentIndexes/Application/Helpers/document-index-execution-lifecycle.helper.ts'
import { CancelKnowledgeBaseDocumentDocumentIndexingListener } from '../../../src/DocumentIndexes/Application/Listeners/cancel-knowledge-base-document-document-indexing.listener.ts'
import { DispatchDocumentIndexingListener } from '../../../src/DocumentIndexes/Application/Listeners/dispatch-document-indexing.listener.ts'
import { DocumentIndexingFailedListener } from '../../../src/DocumentIndexes/Application/Listeners/document-indexing-failed.listener.ts'
import { RetryDocumentIndexingListener } from '../../../src/DocumentIndexes/Application/Listeners/retry-document-indexing.listener.ts'
import { InspectDocumentIndexRetentionQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/inspect-document-index-retention.query.handler.ts'
import { PlanDocumentIndexGarbageQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/plan-document-index-garbage.query.handler.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { ChunkModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/chunk.model.ts'
import { DocumentIndexModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index.model.ts'
import { FailedJobModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/failed-job.model.ts'
import { JobModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/job.model.ts'
import { ChunkRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/chunk.repository.ts'
import { DocumentIndexSuccessReceiptRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/document-index-success-receipt.repository.ts'
import { DocumentIndexRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/document-index.repository.ts'
import { FailedJobRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/job.repository.ts'
import { CollectDocumentRelationGarbageCommandHandler } from '../../../src/Documents/Application/Commands/collect-document-relation-garbage.command.handler.ts'
import { CollectDocumentRevisionGarbageCommandHandler } from '../../../src/Documents/Application/Commands/collect-document-revision-garbage.command.handler.ts'
import { LockDocumentRetentionParentsCommandHandler } from '../../../src/Documents/Application/Commands/lock-document-retention-parents.command.handler.ts'
import { ReserveDocumentForIndexingCommandHandler } from '../../../src/Documents/Application/Commands/reserve-document-for-indexing.command.handler.ts'
import { StartDocumentPruningRetentionCommandHandler } from '../../../src/Documents/Application/Commands/start-document-pruning-retention.command.handler.ts'
import { DocumentGarbageCollectionRequestedEvent } from '../../../src/Documents/Application/Events/document-garbage-collection-requested.event.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../src/Documents/Application/Listeners/document-garbage-collection-requested.listener.ts'
import { GetDocumentForIndexRetryQueryHandler } from '../../../src/Documents/Application/Queries/get-document-for-index-retry.query.handler.ts'
import { GetDocumentRevisionForIndexRetryQueryHandler } from '../../../src/Documents/Application/Queries/get-document-revision-for-index-retry.query.handler.ts'
import { InspectDocumentRelationRetentionQueryHandler } from '../../../src/Documents/Application/Queries/inspect-document-relation-retention.query.handler.ts'
import { InspectDocumentRetentionQueryHandler } from '../../../src/Documents/Application/Queries/inspect-document-retention.query.handler.ts'
import { InspectDocumentRevisionRetentionQueryHandler } from '../../../src/Documents/Application/Queries/inspect-document-revision-retention.query.handler.ts'
import { PlanDocumentRelationGarbageQueryHandler } from '../../../src/Documents/Application/Queries/plan-document-relation-garbage.query.handler.ts'
import { PlanDocumentRevisionGarbageQueryHandler } from '../../../src/Documents/Application/Queries/plan-document-revision-garbage.query.handler.ts'
import { DocumentSourceTypeEnum } from '../../../src/Documents/Domain/Enums/document-source-type.enum.ts'
import { DocumentRelationModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document-relation.model.ts'
import { DocumentRevisionModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document.model.ts'
import { DocumentRelationRepository } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Repositories/document-relation.repository.ts'
import { DocumentRevisionRepository } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Repositories/document-revision.repository.ts'
import { DocumentRepository } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Repositories/document.repository.ts'
import { ActivateKnowledgeBaseDocumentIndexCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/activate-knowledge-base-document-index.command.handler.ts'
import { PruneKnowledgeBaseDocumentsCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/prune-knowledge-base-documents.command.handler.ts'
import { ReserveKnowledgeBaseDocumentForIndexingCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/reserve-knowledge-base-document-for-indexing.command.handler.ts'
import { ValidateKnowledgeBasePruningCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/validate-knowledge-base-pruning.command.handler.ts'
import { GetIndexingKnowledgeBaseQueryHandler } from '../../../src/KnowledgeBases/Application/Queries/get-indexing-knowledge-base.query.handler.ts'
import { GetKnowledgeBaseDocumentIndexingStateQueryHandler } from '../../../src/KnowledgeBases/Application/Queries/get-knowledge-base-document-indexing-state.query.handler.ts'
import { InspectKnowledgeBaseDocumentRetentionQueryHandler } from '../../../src/KnowledgeBases/Application/Queries/inspect-knowledge-base-document-retention.query.handler.ts'
import { KnowledgeBaseDocumentModel } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base.model.ts'
import { KnowledgeBaseDocumentRepository } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base-document.repository.ts'
import { KnowledgeBaseRepository } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base.repository.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { DocumentIndexPersistenceFixture } from '../../Support/document-index-persistence.fixture.ts'
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

const writeRequestDocumentIndexesAssembler = new WriteRequestDocumentIndexesAssembler({
  embeddingModel: config.embeddingModel,
  embeddingDimensions: config.embeddingDimensions,
  chunkingModel: config.chunkingModel,
  chunkingProfile: 'test',
  embeddingProfile: 'test',
  lexicalProfile: 'test',
  relationProfile: 'test',
})

const failureDecision = (
  job: { id: string; attempts: number; leaseExpiresAt: Date | null },
  errorCode: string,
  errorMessage: string,
) => {
  const failedAt = new Date(Date.now() - 60_000)
  const transition = new RagJobEntity({
    id: job.id,
    status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    attempts: job.attempts,
    leaseExpiresAt: job.leaseExpiresAt,
  }).afterFailure({ errorMessage, failedAt })

  return { errorCode, errorMessage: transition.errorMessage, failedAt, retryAt: transition.retryAt }
}

test(
  'job failure lifecycle: 3 retries then terminal archive, followed by manual retry',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)
    try {
      const knowledgeBaseModelRepository = dataSource.getRepository(KnowledgeBaseModel)
      const documentModelRepository = dataSource.getRepository(DocumentModel)
      const documentRevisionModelRepository = dataSource.getRepository(DocumentRevisionModel)
      const documentIndexModelRepository = dataSource.getRepository(DocumentIndexModel)
      const knowledgeBaseDocumentModelRepository = dataSource.getRepository(KnowledgeBaseDocumentModel)
      const jobModelRepository = dataSource.getRepository(JobModel)
      const failedJobModelRepository = dataSource.getRepository(FailedJobModel)

      const chunkRepository = new ChunkRepository(persistenceTransaction, retrievalDataSource)
      const documentRelationRepository = new DocumentRelationRepository(persistenceTransaction)
      const documentIndexRepository = new DocumentIndexRepository(persistenceTransaction)
      const failedJobRepository = new FailedJobRepository(persistenceTransaction)
      const jobRepository = new JobRepository(persistenceTransaction)
      const knowledgeBaseDocumentRepository = new KnowledgeBaseDocumentRepository(persistenceTransaction)
      const knowledgeBaseRepository = new KnowledgeBaseRepository(persistenceTransaction)
      const documentRepository = new DocumentRepository(persistenceTransaction)
      const documentRevisionRepository = new DocumentRevisionRepository(persistenceTransaction)

      const documentIndexPersistenceFixture = new DocumentIndexPersistenceFixture(
        persistenceTransaction,
        jobRepository,
        knowledgeBaseDocumentRepository,
        documentIndexRepository,
        knowledgeBaseRepository,
        documentRepository,
        documentRevisionRepository,
        failedJobRepository,
        chunkRepository,
        documentRelationRepository,
      )
      const claimNext = () =>
        new DispatchDocumentIndexingListener(
          documentIndexPersistenceFixture.persistenceTransaction,
          new ReserveDocumentForIndexingCommandHandler(documentIndexPersistenceFixture.documentRepository),
          new ReserveKnowledgeBaseDocumentForIndexingCommandHandler(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
          documentIndexPersistenceFixture.documentIndexRepository,
          documentIndexPersistenceFixture.jobRepository,
          documentIndexPersistenceFixture.failedJobRepository,
          config.workerLeaseSeconds,
          new ActivateKnowledgeBaseDocumentIndexCommandHandler(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
          new GetIndexingKnowledgeBaseQueryHandler(documentIndexPersistenceFixture.knowledgeBaseRepository),
          new DocumentIndexSuccessReceiptRepository(documentIndexPersistenceFixture.persistenceTransaction),
        )

      const testKey = randomUUID()
      const base = await knowledgeBaseModelRepository.save(
        knowledgeBaseModelRepository.create({ projectId: `retry-${testKey}`, projectName: `retry-test-${testKey}` }),
      )
      const doc = await documentModelRepository.save(
        documentModelRepository.create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
          sourceKey: testKey,
          sourcePath: `docs/${testKey}.md`,
          unreferencedSince: null,
        }),
      )
      const rev = await documentRevisionModelRepository.save(
        documentRevisionModelRepository.create({
          documentId: doc.id,
          contentSha256: 'c'.repeat(64),
          title: 'Retry Test Document',
          content: '# Retry Test Content\n\nTesting retry lifecycle and archiving.',
        }),
      )
      const idx = await documentIndexModelRepository.save(
        documentIndexModelRepository.create({
          documentId: doc.id,
          revisionId: rev.id,
          pipelineHash: createHash('sha256')
            .update(
              writeRequestDocumentIndexesAssembler.serializeDocumentIndexPipelineHashInput({
                contentSha256: createHash('sha256').update(rev.content).digest('hex'),
                embeddingModel: config.embeddingModel,
                embeddingDimensions: config.embeddingDimensions,
                chunkingModel: config.chunkingModel,
                context: { content: rev.content },
              }),
            )
            .digest('hex'),
          chunkingModel: 'integration-test-chunker',
          chunkingProfile: 'test',
          embeddingModel: 'integration-test-model',
          embeddingDimensions: 384,
          embeddingProfile: 'test',
          lexicalProfile: 'test',
          relationProfile: 'test',
          status: DocumentIndexStatusEnum.BUILDING,
          readyAt: null,
          unreferencedSince: null,
        }),
      )
      await knowledgeBaseDocumentModelRepository.save(
        knowledgeBaseDocumentModelRepository.create({
          knowledgeBaseId: base.id,
          documentId: doc.id,
          activeDocumentIndexId: null,
          requestedGeneration: '1',
          isEntry: true,
          alwaysIncludeFullContent: false,
        }),
      )
      const initialJob = await jobModelRepository.save(
        jobModelRepository.create({
          knowledgeBaseId: base.id,
          documentId: doc.id,
          documentIndexId: idx.id,
          generation: '1',
          status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
          attempts: 0,
          availableAt: new Date(Date.now() - 1000),
          reservedAt: null,
          idempotencyKey: null,
          retryOfFailedJobId: null,
          payload: { content: rev.content },
          executionState: null,
          executionVerification: null,
          leaseExpiresAt: null,
        }),
      )

      // Attempt 1
      const claim1 = await claimNext().handle()
      assert.ok(claim1)
      assert.equal(claim1.id, initialJob.id)
      assert.equal(claim1.attempts, 1)
      await new DocumentIndexingFailedListener(
        documentIndexPersistenceFixture.persistenceTransaction,
        new ReserveDocumentForIndexingCommandHandler(documentIndexPersistenceFixture.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingCommandHandler(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
        documentIndexPersistenceFixture.jobRepository,
        documentIndexPersistenceFixture.documentIndexRepository,
        documentIndexPersistenceFixture.failedJobRepository,
      ).handle({
        jobDelivery: claim1,
        failureDecision: {
          ...failureDecision(claim1, 'API_TIMEOUT', 'First attempt timed out'),
        },
      })
      const jobAfter1 = await jobModelRepository.findOneByOrFail({ id: initialJob.id })
      assert.equal(jobAfter1.status, 'queued')
      assert.equal(jobAfter1.attempts, 1)
      const firstError = jobAfter1.executionState?.lastError as
        { code: string; message: string; failedAt: string } | undefined
      assert.equal(firstError?.code, 'API_TIMEOUT')
      assert.equal(firstError?.message, 'First attempt timed out')
      assert.match(firstError?.failedAt ?? '', /^\d{4}-\d{2}-\d{2}T/)
      assert.equal(jobAfter1.reservedAt, null)
      assert.equal(jobAfter1.executionVerification, null)
      assert.equal(await failedJobModelRepository.countBy({ jobId: initialJob.id }), 0)

      // Attempt 2
      const claim2 = await claimNext().handle()
      assert.ok(claim2)
      assert.equal(claim2.attempts, 2)
      await new DocumentIndexingFailedListener(
        documentIndexPersistenceFixture.persistenceTransaction,
        new ReserveDocumentForIndexingCommandHandler(documentIndexPersistenceFixture.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingCommandHandler(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
        documentIndexPersistenceFixture.jobRepository,
        documentIndexPersistenceFixture.documentIndexRepository,
        documentIndexPersistenceFixture.failedJobRepository,
      ).handle({
        jobDelivery: claim2,
        failureDecision: {
          ...failureDecision(claim2, 'RATE_LIMITED', 'Second attempt rate limited'),
        },
      })
      const jobAfter2 = await jobModelRepository.findOneByOrFail({ id: initialJob.id })
      assert.equal(jobAfter2.status, 'queued')
      assert.equal(jobAfter2.attempts, 2)

      // Attempt 3
      const claim3 = await claimNext().handle()
      assert.ok(claim3)
      assert.equal(claim3.attempts, 3)
      await new DocumentIndexingFailedListener(
        documentIndexPersistenceFixture.persistenceTransaction,
        new ReserveDocumentForIndexingCommandHandler(documentIndexPersistenceFixture.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingCommandHandler(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
        documentIndexPersistenceFixture.jobRepository,
        documentIndexPersistenceFixture.documentIndexRepository,
        documentIndexPersistenceFixture.failedJobRepository,
      ).handle({
        jobDelivery: claim3,
        failureDecision: {
          ...failureDecision(claim3, 'SERVICE_UNAVAILABLE', 'Third attempt unavailable'),
        },
      })
      const jobAfter3 = await jobModelRepository.findOneByOrFail({ id: initialJob.id })
      assert.equal(jobAfter3.status, 'queued')
      assert.equal(jobAfter3.attempts, 3)

      // Attempt 4 (Final attempt -> Terminal archive)
      const claim4 = await claimNext().handle()
      assert.ok(claim4)
      assert.equal(claim4.attempts, 4)
      await new DocumentIndexingFailedListener(
        documentIndexPersistenceFixture.persistenceTransaction,
        new ReserveDocumentForIndexingCommandHandler(documentIndexPersistenceFixture.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingCommandHandler(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
        documentIndexPersistenceFixture.jobRepository,
        documentIndexPersistenceFixture.documentIndexRepository,
        documentIndexPersistenceFixture.failedJobRepository,
      ).handle({
        jobDelivery: claim4,
        failureDecision: {
          ...failureDecision(claim4, 'FATAL_MODEL_ERROR', 'Fourth attempt failed permanently'),
        },
      })

      // jobs table must no longer have the job
      assert.equal(await jobModelRepository.findOneBy({ id: initialJob.id }), null)

      // failed_jobs table must have the archived failure
      const failedJobRecord = await failedJobModelRepository.findOneByOrFail({ jobId: initialJob.id })
      assert.equal(failedJobRecord.attempts, 4)
      assert.equal(failedJobRecord.errorCode, 'FATAL_MODEL_ERROR')
      assert.equal(failedJobRecord.errorMessage, 'Fourth attempt failed permanently')
      assert.equal(failedJobRecord.retryPayload.format, 'rag-v1')
      assert.deepEqual(failedJobRecord.retryPayload.input, initialJob.payload)
      assert.equal(
        (failedJobRecord.retryPayload.executionState as { lastError: { code: string } }).lastError.code,
        'FATAL_MODEL_ERROR',
      )
      assert.equal(failedJobRecord.retriedAt, null)

      const laterRevision = await documentRevisionModelRepository.save(
        documentRevisionModelRepository.create({
          documentId: doc.id,
          contentSha256: 'e'.repeat(64),
          title: 'Later Source Revision',
          content: '# Later Source Revision\n\nThis revision is newer but is not the failed job target.',
        }),
      )
      const latestCreatedRevision = await documentRevisionModelRepository.findOne({
        where: { documentId: doc.id },
        order: { createdAt: 'DESC' },
      })
      assert.equal(latestCreatedRevision?.id, laterRevision.id)

      const retryUseCase = new RetryDocumentIndexingListener(
        documentIndexPersistenceFixture.persistenceTransaction,
        new GetIndexingKnowledgeBaseQueryHandler(documentIndexPersistenceFixture.knowledgeBaseRepository),
        new GetDocumentForIndexRetryQueryHandler(documentIndexPersistenceFixture.documentRepository),
        new GetKnowledgeBaseDocumentIndexingStateQueryHandler(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
        new GetDocumentRevisionForIndexRetryQueryHandler(documentIndexPersistenceFixture.documentRevisionRepository),
        documentIndexPersistenceFixture.documentIndexRepository,
        documentIndexPersistenceFixture.jobRepository,
        documentIndexPersistenceFixture.failedJobRepository,
        { modelId: config.embeddingModel } as never,
        config,
        writeRequestDocumentIndexesAssembler,
        new ReserveDocumentForIndexingCommandHandler(documentIndexPersistenceFixture.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingCommandHandler(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
      )
      const retry = () => retryUseCase.handle({ projectId: base.projectId, failedJobId: failedJobRecord.id })

      await assert.rejects(
        retryUseCase.handle({ projectId: `different-project-${testKey}`, failedJobId: failedJobRecord.id }),
        DocumentIndexingNotFoundException,
      )
      assert.equal((await failedJobModelRepository.findOneByOrFail({ id: failedJobRecord.id })).retriedAt, null)

      await knowledgeBaseDocumentModelRepository.update(
        { knowledgeBaseId: base.id, documentId: doc.id },
        { requestedGeneration: '2' },
      )
      await assert.rejects(retry(), StaleDocumentIndexingFailureException)
      await knowledgeBaseDocumentModelRepository.update(
        { knowledgeBaseId: base.id, documentId: doc.id },
        { requestedGeneration: '1' },
      )
      await documentIndexModelRepository.update(idx.id, { revisionId: laterRevision.id })
      await assert.rejects(retry(), StaleDocumentIndexingFailureException)
      await documentIndexModelRepository.update(idx.id, { revisionId: rev.id, pipelineHash: 'f'.repeat(64) })
      await assert.rejects(retry(), StaleDocumentIndexingFailureException)
      await documentIndexModelRepository.update(idx.id, { pipelineHash: idx.pipelineHash })
      assert.equal(await jobModelRepository.count(), 0)
      assert.equal((await failedJobModelRepository.findOneByOrFail({ id: failedJobRecord.id })).retriedAt, null)

      const retryResults = await Promise.allSettled([retry(), retry()])
      const accepted = retryResults.filter((result) => result.status === 'fulfilled')
      const rejected = retryResults.filter((result) => result.status === 'rejected')
      assert.equal(accepted.length, 1)
      assert.equal(rejected.length, 1)
      assert.ok(
        rejected[0]?.reason instanceof IndexRetrySourceChangedException ||
          rejected[0]?.reason instanceof DocumentIndexingNotFoundException,
      )
      assert.equal(await jobModelRepository.count(), 1)
      const retryResult = accepted[0]

      if (retryResult === undefined) throw new Error('Expected atomic retry to create a job')

      const newJobId = retryResult.value.jobId
      assert.ok(typeof newJobId === 'string')
      assert.notEqual(newJobId, initialJob.id)
      assert.notEqual(newJobId, failedJobRecord.id)
      await assert.rejects(retry(), DocumentIndexingNotFoundException)
      assert.equal(await failedJobModelRepository.findOneBy({ id: failedJobRecord.id }), null)

      // The newly created retry job must be queued with attempts = 0
      const retryJobInDb = await jobModelRepository.findOneByOrFail({ id: newJobId })
      assert.equal(retryJobInDb.status, 'queued')
      assert.equal(retryJobInDb.attempts, 0)
      assert.equal(retryJobInDb.retryOfFailedJobId, null)
      assert.ok(retryJobInDb.availableAt instanceof Date)
      assert.equal(retryJobInDb.reservedAt, null)
      assert.equal(retryJobInDb.leaseToken, null)
      assert.equal(retryJobInDb.executionVerification, null)
      assert.ok(typeof retryJobInDb.idempotencyKey === 'string')
      assert.match(retryJobInDb.idempotencyKey, /^[0-9a-f-]{36}$/)
      assert.deepEqual(retryJobInDb.payload, initialJob.payload)
      assert.equal(retryJobInDb.executionState?.lastError, undefined)
    } finally {
      await cleanup()
    }
  },
)

test(
  'knowledgeBaseDocument prune and garbage collection lifecycle in isolated schema',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)
    try {
      const knowledgeBaseModelRepository = dataSource.getRepository(KnowledgeBaseModel)
      const documentModelRepository = dataSource.getRepository(DocumentModel)
      const documentRevisionModelRepository = dataSource.getRepository(DocumentRevisionModel)
      const documentIndexModelRepository = dataSource.getRepository(DocumentIndexModel)
      const knowledgeBaseDocumentModelRepository = dataSource.getRepository(KnowledgeBaseDocumentModel)
      const jobModelRepository = dataSource.getRepository(JobModel)
      const failedJobModelRepository = dataSource.getRepository(FailedJobModel)

      const chunkRepository = new ChunkRepository(persistenceTransaction, retrievalDataSource)
      const documentRelationRepository = new DocumentRelationRepository(persistenceTransaction)
      const documentIndexRepository = new DocumentIndexRepository(persistenceTransaction)
      const failedJobRepository = new FailedJobRepository(persistenceTransaction)
      const jobRepository = new JobRepository(persistenceTransaction)
      const knowledgeBaseDocumentRepository = new KnowledgeBaseDocumentRepository(persistenceTransaction)
      const knowledgeBaseRepository = new KnowledgeBaseRepository(persistenceTransaction)
      const documentRepository = new DocumentRepository(persistenceTransaction)
      const documentRevisionRepository = new DocumentRevisionRepository(persistenceTransaction)

      const documentIndexPersistenceFixture = new DocumentIndexPersistenceFixture(
        persistenceTransaction,
        jobRepository,
        knowledgeBaseDocumentRepository,
        documentIndexRepository,
        knowledgeBaseRepository,
        documentRepository,
        documentRevisionRepository,
        failedJobRepository,
        chunkRepository,
        documentRelationRepository,
      )

      const testKey = randomUUID()
      const base = await knowledgeBaseModelRepository.save(
        knowledgeBaseModelRepository.create({ projectId: `prune-${testKey}`, projectName: `prune-test-${testKey}` }),
      )
      const sharedBase = await knowledgeBaseModelRepository.save(
        knowledgeBaseModelRepository.create({ projectId: `shared-${testKey}`, projectName: `shared-test-${testKey}` }),
      )
      const doc1 = await documentModelRepository.save(
        documentModelRepository.create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
          sourceKey: `doc1-${testKey}`,
          sourcePath: `docs/doc1-${testKey}.md`,
          unreferencedSince: null,
        }),
      )
      const relationTarget = await documentModelRepository.save(
        documentModelRepository.create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
          sourceKey: `target-${testKey}`,
          sourcePath: `docs/target-${testKey}.md`,
          unreferencedSince: null,
        }),
      )
      const rev1 = await documentRevisionModelRepository.save(
        documentRevisionModelRepository.create({
          documentId: doc1.id,
          contentSha256: 'e'.repeat(64),
          title: 'Prunable Document',
          content: '# Prunable Document\n\nTo be pruned.',
        }),
      )
      const idx1 = await documentIndexModelRepository.save(
        documentIndexModelRepository.create({
          documentId: doc1.id,
          revisionId: rev1.id,
          pipelineHash: 'f'.repeat(64),
          chunkingModel: 'test',
          chunkingProfile: 'test',
          embeddingModel: 'integration-test-model',
          embeddingDimensions: 384,
          embeddingProfile: 'test',
          lexicalProfile: 'test',
          relationProfile: 'test',
          status: DocumentIndexStatusEnum.READY,
          readyAt: new Date(),
          unreferencedSince: null,
        }),
      )
      await knowledgeBaseDocumentModelRepository.save(
        knowledgeBaseDocumentModelRepository.create({
          knowledgeBaseId: base.id,
          documentId: doc1.id,
          activeDocumentIndexId: idx1.id,
          requestedGeneration: '1',
          isEntry: true,
          alwaysIncludeFullContent: false,
        }),
      )
      await knowledgeBaseDocumentModelRepository.save(
        knowledgeBaseDocumentModelRepository.create({
          knowledgeBaseId: sharedBase.id,
          documentId: doc1.id,
          activeDocumentIndexId: idx1.id,
          requestedGeneration: '1',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
      )
      const chunkModelRepository = dataSource.getRepository(ChunkModel)
      const documentRelationModelRepository = dataSource.getRepository(DocumentRelationModel)
      const chunk = await chunkModelRepository.save(
        chunkModelRepository.create({
          documentIndexId: idx1.id,
          ordinal: 0,
          headingPath: ['Prunable Document'],
          content: 'To be pruned.',
          blockStart: 1,
          blockEnd: 2,
          tokenCount: 4,
          embedding: Array.from({ length: 384 }, () => 0),
          searchVector: '',
        }),
      )
      const relation = await documentRelationModelRepository.save(
        documentRelationModelRepository.create({
          sourceIndexId: idx1.id,
          targetDocumentId: relationTarget.id,
          targetReference: relationTarget.sourcePath,
          targetAnchor: null,
          relationType: 'markdown_link',
          evidenceBlockStart: 1,
          evidenceBlockEnd: 2,
          evidenceText: 'To be pruned.',
        }),
      )
      const queuedForPrune = await jobModelRepository.save(
        jobModelRepository.create({
          knowledgeBaseId: base.id,
          documentId: doc1.id,
          documentIndexId: idx1.id,
          generation: '1',
          status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
          attempts: 0,
          availableAt: new Date(Date.now() - 1000),
          reservedAt: null,
          idempotencyKey: null,
          retryOfFailedJobId: null,
          payload: {},
          executionState: null,
          executionVerification: null,
          leaseExpiresAt: null,
        }),
      )
      const retainedFailure = await failedJobModelRepository.save(
        failedJobModelRepository.create({
          jobId: randomUUID(),
          knowledgeBaseId: base.id,
          documentId: doc1.id,
          documentIndexId: idx1.id,
          generation: '1',
          attempts: 4,
          errorCode: 'MODEL_ERROR',
          errorMessage: 'Archived failure',
          blockedReasons: [],
          retryPayload: {},
          failedAt: new Date(),
          retriedAt: null,
        }),
      )

      const startDocumentRetention = new StartDocumentPruningRetentionCommandHandler(
        documentIndexPersistenceFixture.documentRepository,
        new InspectDocumentRetentionQueryHandler(
          new InspectKnowledgeBaseDocumentRetentionQueryHandler(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
          new InspectDocumentRevisionRetentionQueryHandler(documentIndexPersistenceFixture.documentRevisionRepository),
          new InspectDocumentIndexRetentionQueryHandler(documentIndexPersistenceFixture.documentIndexRepository),
          new InspectDocumentRelationRetentionQueryHandler(documentIndexPersistenceFixture.documentRelationRepository),
          documentIndexPersistenceFixture.documentRepository,
          documentIndexPersistenceFixture.jobRepository,
          documentIndexPersistenceFixture.failedJobRepository,
        ),
      )
      const pruneFailure = new Error('Injected failure after pruning cancellation and retention')
      let rejectPruningCompletion = true
      const prune = new PruneKnowledgeBaseDocumentsCommandHandler(
        documentIndexPersistenceFixture.persistenceTransaction,
        new ValidateKnowledgeBasePruningCommandHandler(documentIndexPersistenceFixture.knowledgeBaseRepository),
        new LockDocumentRetentionParentsCommandHandler(documentIndexPersistenceFixture.documentRepository),
        documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        {
          deliver: (event) =>
            new CancelKnowledgeBaseDocumentDocumentIndexingListener(
              documentIndexPersistenceFixture.jobRepository,
            ).handle(event),
        },
        new StartDocumentIndexPruningRetentionCommandHandler(
          documentIndexPersistenceFixture.documentIndexRepository,
          documentIndexPersistenceFixture.jobRepository,
          new InspectKnowledgeBaseDocumentRetentionQueryHandler(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
        ),
        {
          execute: async (retentionRequest) => {
            await startDocumentRetention.execute(retentionRequest)

            if (rejectPruningCompletion) throw pruneFailure
          },
        },
      )
      const membershipBeforePruning = await knowledgeBaseDocumentModelRepository.findOneByOrFail({
        knowledgeBaseId: base.id,
        documentId: doc1.id,
      })
      const jobBeforePruning = await jobModelRepository.findOneByOrFail({ id: queuedForPrune.id })
      const indexBeforePruning = await documentIndexModelRepository.findOneByOrFail({ id: idx1.id })
      const documentBeforePruning = await documentModelRepository.findOneByOrFail({ id: doc1.id })
      await assert.rejects(
        prune.execute({ projectId: base.projectId, knowledgeBaseId: base.id, documentIds: [] }),
        (error: unknown) => error === pruneFailure,
      )
      assert.deepEqual(
        await knowledgeBaseDocumentModelRepository.findOneByOrFail({
          knowledgeBaseId: base.id,
          documentId: doc1.id,
        }),
        membershipBeforePruning,
      )
      assert.deepEqual(await jobModelRepository.findOneByOrFail({ id: queuedForPrune.id }), jobBeforePruning)
      assert.deepEqual(await documentIndexModelRepository.findOneByOrFail({ id: idx1.id }), indexBeforePruning)
      assert.deepEqual(await documentModelRepository.findOneByOrFail({ id: doc1.id }), documentBeforePruning)
      rejectPruningCompletion = false
      const prunedKnowledgeBaseDocuments = await prune.execute({
        projectId: base.projectId,
        knowledgeBaseId: base.id,
        documentIds: [],
      })
      assert.deepEqual(
        prunedKnowledgeBaseDocuments.map((knowledgeBaseDocument) => ({
          knowledgeBaseId: knowledgeBaseDocument.knowledgeBaseId,
          documentId: knowledgeBaseDocument.documentId,
        })),
        [{ knowledgeBaseId: base.id, documentId: doc1.id }],
      )

      assert.equal(
        await knowledgeBaseDocumentModelRepository.findOneBy({ knowledgeBaseId: base.id, documentId: doc1.id }),
        null,
      )
      assert.equal(await jobModelRepository.findOneBy({ id: queuedForPrune.id }), null)
      assert.ok(await failedJobModelRepository.findOneBy({ id: retainedFailure.id }))
      assert.equal((await documentIndexModelRepository.findOneByOrFail({ id: idx1.id })).unreferencedSince, null)
      assert.ok(await chunkModelRepository.findOneBy({ id: chunk.id }))
      assert.ok(await documentRelationModelRepository.findOneBy({ id: relation.id }))

      assert.deepEqual(
        (await prune.execute({ projectId: sharedBase.projectId, knowledgeBaseId: sharedBase.id, documentIds: [] })).map(
          (knowledgeBaseDocument) => ({
            knowledgeBaseId: knowledgeBaseDocument.knowledgeBaseId,
            documentId: knowledgeBaseDocument.documentId,
          }),
        ),
        [{ knowledgeBaseId: sharedBase.id, documentId: doc1.id }],
      )
      assert.ok((await documentIndexModelRepository.findOneByOrFail({ id: idx1.id })).unreferencedSince)
      const expiredAt = new Date(Date.now() - config.gcRetentionMs - 10_000)
      await documentIndexModelRepository.update({ id: idx1.id }, { unreferencedSince: expiredAt })
      await documentRevisionModelRepository.update({ id: rev1.id }, { createdAt: expiredAt })
      const collect = new DocumentGarbageCollectionRequestedListener(
        documentIndexPersistenceFixture.persistenceTransaction,
        documentIndexPersistenceFixture.documentRepository,
        new PlanDocumentIndexGarbageQueryHandler(documentIndexPersistenceFixture.documentIndexRepository),
        new CollectDocumentIndexGarbageCommandHandler(
          documentIndexPersistenceFixture.documentIndexRepository,
          documentIndexPersistenceFixture.jobRepository,
          documentIndexPersistenceFixture.failedJobRepository,
          new InspectKnowledgeBaseDocumentRetentionQueryHandler(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
          new CollectDocumentRelationGarbageCommandHandler(documentIndexPersistenceFixture.documentRelationRepository),
          new CollectIndexChunkGarbageCommandHandler(documentIndexPersistenceFixture.chunkRepository),
        ),
        new PlanDocumentRevisionGarbageQueryHandler(documentIndexPersistenceFixture.documentRevisionRepository),
        new CollectDocumentRevisionGarbageCommandHandler(
          documentIndexPersistenceFixture.documentRevisionRepository,
          new InspectDocumentIndexRetentionQueryHandler(documentIndexPersistenceFixture.documentIndexRepository),
        ),
        new PlanDocumentRelationGarbageQueryHandler(documentIndexPersistenceFixture.documentRelationRepository),
        new LockDocumentRetentionParentsCommandHandler(documentIndexPersistenceFixture.documentRepository),
        new InspectDocumentRetentionQueryHandler(
          new InspectKnowledgeBaseDocumentRetentionQueryHandler(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
          new InspectDocumentRevisionRetentionQueryHandler(documentIndexPersistenceFixture.documentRevisionRepository),
          new InspectDocumentIndexRetentionQueryHandler(documentIndexPersistenceFixture.documentIndexRepository),
          new InspectDocumentRelationRetentionQueryHandler(documentIndexPersistenceFixture.documentRelationRepository),
          documentIndexPersistenceFixture.documentRepository,
          documentIndexPersistenceFixture.jobRepository,
          documentIndexPersistenceFixture.failedJobRepository,
        ),
        config,
        documentIndexPersistenceFixture.jobRepository,
        documentIndexPersistenceFixture.failedJobRepository,
      )

      assert.equal(await collect.handle(new DocumentGarbageCollectionRequestedEvent()), undefined)
      assert.ok(
        await documentRevisionModelRepository.findOneBy({ id: rev1.id }),
        'a retained failed job protects its revision',
      )
      assert.ok(await documentIndexModelRepository.findOneBy({ id: idx1.id }))
      assert.ok(await chunkModelRepository.findOneBy({ id: chunk.id }))
      assert.ok(await documentRelationModelRepository.findOneBy({ id: relation.id }))

      await failedJobModelRepository.update({ id: retainedFailure.id }, { failedAt: expiredAt })
      assert.equal(await collect.handle(new DocumentGarbageCollectionRequestedEvent()), undefined)
      assert.equal(await failedJobModelRepository.findOneBy({ id: retainedFailure.id }), null)
      assert.equal(await documentIndexModelRepository.findOneBy({ id: idx1.id }), null)
      assert.equal(await chunkModelRepository.findOneBy({ id: chunk.id }), null)
      assert.equal(await documentRelationModelRepository.findOneBy({ id: relation.id }), null)
      assert.equal(await documentRevisionModelRepository.findOneBy({ id: rev1.id }), null)
      assert.ok((await documentModelRepository.findOneByOrFail({ id: doc1.id })).unreferencedSince)
      assert.ok((await documentModelRepository.findOneByOrFail({ id: relationTarget.id })).unreferencedSince)

      await documentModelRepository.update({ id: doc1.id }, { unreferencedSince: expiredAt })
      await documentModelRepository.update({ id: relationTarget.id }, { unreferencedSince: expiredAt })
      assert.equal(await collect.handle(new DocumentGarbageCollectionRequestedEvent()), undefined)
      assert.equal(await documentModelRepository.findOneBy({ id: doc1.id }), null)
      assert.equal(await documentModelRepository.findOneBy({ id: relationTarget.id }), null)
    } finally {
      await cleanup()
    }
  },
)
