import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { DataSource } from 'typeorm'

import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/Chunks/UseCases/replace-index-chunk.use-case.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/Application/DocumentIndexes/Enums/document-index-execution-stage.enum.ts'
import { DocumentIndexExecutionClaimConflictException } from '../../../src/Application/DocumentIndexes/Exceptions/document-index-execution-claim-conflict.exception.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-document-index-execution-lease.exception.ts'
import {
  DocumentIndexExecutionLifecycle as RagJobEntity,
  DOCUMENT_INDEX_EXECUTION_STATUS,
} from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { DispatchDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/dispatch-document-indexing.listener.ts'
import { DocumentIndexedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexed.listener.ts'
import { DocumentIndexingFailedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexing-failed.listener.ts'
import { AuthorizeDocumentIndexChunkReplacementUseCase } from '../../../src/Application/DocumentIndexes/UseCases/authorize-document-index-chunk-replacement.use-case.ts'
import { ReplacePlannedDocumentRelationsUseCase } from '../../../src/Application/DocumentRelations/UseCases/replace-planned-document-relations.use-case.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import { ActivateKnowledgeBaseDocumentIndexUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/activate-knowledge-base-document-index.use-case.ts'
import { CompleteKnowledgeBaseDocumentIndexingUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/complete-knowledge-base-document-indexing.use-case.ts'
import { ReserveKnowledgeBaseDocumentForIndexingUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/reserve-knowledge-base-document-for-indexing.use-case.ts'
import { GetIndexingKnowledgeBaseUseCase } from '../../../src/Application/KnowledgeBases/UseCases/get-indexing-knowledge-base.use-case.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { LexicalSearchQueryAdapter } from '../../../src/Infrastructure/Persistence/Adapters/lexical-search-query.adapter.ts'
import { ChunkModel } from '../../../src/Infrastructure/Persistence/Models/chunk.model.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { FailedJobModel } from '../../../src/Infrastructure/Persistence/Models/failed-job.model.ts'
import { JobModel } from '../../../src/Infrastructure/Persistence/Models/job.model.ts'
import { KnowledgeBaseDocumentModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'
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
import { HybridKnowledgeRetrievalResource } from '../../../src/Interfaces/Http/Resources/hybrid-knowledge-retrieval.resource.ts'
import { DocumentIndexPersistenceFixture } from '../../Support/document-index-persistence.fixture.ts'
import { createMarkdownChunkPlan } from '../../Support/markdown-chunk-plan.fixture.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

const lexicalFormatter = new LexicalSearchQueryAdapter()

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

test('concurrent workers claim a queued job exactly once', { skip: !process.env.RAG_DATABASE_URL }, async () => {
  const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()

  try {
    const knowledgeBaseModelRepository = dataSource.getRepository(KnowledgeBaseModel)
    const documentModelRepository = dataSource.getRepository(DocumentModel)
    const documentRevisionModelRepository = dataSource.getRepository(DocumentRevisionModel)
    const documentIndexModelRepository = dataSource.getRepository(DocumentIndexModel)
    const knowledgeBaseDocumentModelRepository = dataSource.getRepository(KnowledgeBaseDocumentModel)
    const jobModelRepository = dataSource.getRepository(JobModel)
    const testKey = randomUUID()
    const base = await knowledgeBaseModelRepository.save(
      knowledgeBaseModelRepository.create({
        projectId: `claim-project-${testKey}`,
        projectName: `claim-test-${testKey}`,
      }),
    )
    const document = await documentModelRepository.save(
      documentModelRepository.create({
        sourceType: 'repository',
        sourceKey: testKey,
        sourcePath: `${testKey}.md`,
        unreferencedSince: null,
      }),
    )
    const revision = await documentRevisionModelRepository.save(
      documentRevisionModelRepository.create({
        documentId: document.id,
        contentSha256: 'a'.repeat(64),
        title: 'claim concurrency',
        content: 'test',
      }),
    )
    const index = await documentIndexModelRepository.save(
      documentIndexModelRepository.create({
        documentId: document.id,
        revisionId: revision.id,
        pipelineHash: 'b'.repeat(64),
        chunkingModel: 'test',
        chunkingProfile: 'test',
        embeddingModel: 'integration-test-model',
        embeddingDimensions: 384,
        embeddingProfile: 'test',
        lexicalProfile: lexicalFormatter.format('claimed document').profileVersion,
        relationProfile: 'test',
        status: DocumentIndexStatusEnum.BUILDING,
        readyAt: null,
        unreferencedSince: null,
      }),
    )
    const unrelatedIndex = await documentIndexModelRepository.save(
      documentIndexModelRepository.create({
        ...index,
        id: randomUUID(),
        pipelineHash: 'c'.repeat(64),
      }),
    )
    await knowledgeBaseDocumentModelRepository.save(
      knowledgeBaseDocumentModelRepository.create({
        knowledgeBaseId: base.id,
        documentId: document.id,
        activeDocumentIndexId: null,
        requestedGeneration: '1',
        isEntry: false,
        alwaysIncludeFullContent: false,
      }),
    )
    const job = await jobModelRepository.save(
      jobModelRepository.create({
        knowledgeBaseId: base.id,
        documentId: document.id,
        documentIndexId: index.id,
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
    const ineligibleKnowledgeBases = await knowledgeBaseModelRepository.save([
      knowledgeBaseModelRepository.create({
        projectId: `claim-future-project-${testKey}`,
        projectName: `claim-future-${testKey}`,
      }),
      knowledgeBaseModelRepository.create({
        projectId: `claim-active-project-${testKey}`,
        projectName: `claim-active-${testKey}`,
      }),
    ])
    await knowledgeBaseDocumentModelRepository.save(
      ineligibleKnowledgeBases.map((ineligibleKnowledgeBase) =>
        knowledgeBaseDocumentModelRepository.create({
          knowledgeBaseId: ineligibleKnowledgeBase.id,
          documentId: document.id,
          activeDocumentIndexId: null,
          requestedGeneration: '1',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
      ),
    )
    const ineligibleLeaseExpiresAt = new Date(Date.now() + config.workerLeaseSeconds * 1000)
    const ineligibleJobs = await jobModelRepository.save([
      jobModelRepository.create({
        ...job,
        id: randomUUID(),
        knowledgeBaseId: ineligibleKnowledgeBases[0]!.id,
        status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
        attempts: 0,
        availableAt: new Date(Date.now() + 60_000),
        reservedAt: null,
        leaseToken: null,
      }),
      jobModelRepository.create({
        ...job,
        id: randomUUID(),
        knowledgeBaseId: ineligibleKnowledgeBases[1]!.id,
        documentIndexId: unrelatedIndex.id,
        status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
        attempts: 1,
        availableAt: new Date(Date.now() - 1000),
        reservedAt: new Date(),
        leaseToken: randomUUID(),
        leaseExpiresAt: ineligibleLeaseExpiresAt,
        executionVerification: {
          claim_token: randomUUID(),
          lease_expires_at: ineligibleLeaseExpiresAt.toISOString(),
        },
      }),
    ])

    const createWorker = (withRetrieval = false) => {
      const persistenceTransaction = new PersistenceTransaction(
        dataSource,
        withRetrieval ? retrievalDataSource : undefined,
      )
      const chunkRepository = new ChunkRepository(persistenceTransaction, retrievalDataSource)
      const documentRelationRepository = new DocumentRelationRepository(persistenceTransaction)
      const documentIndexRepository = new DocumentIndexRepository(persistenceTransaction)
      const failedJobRepository = new FailedJobRepository(persistenceTransaction)
      const jobRepository = new JobRepository(persistenceTransaction)
      const knowledgeBaseDocumentRepository = new KnowledgeBaseDocumentRepository(persistenceTransaction)

      return new DocumentIndexPersistenceFixture(
        persistenceTransaction,
        jobRepository,
        knowledgeBaseDocumentRepository,
        documentIndexRepository,
        new KnowledgeBaseRepository(persistenceTransaction),
        new DocumentRepository(persistenceTransaction),
        new DocumentRevisionRepository(persistenceTransaction),
        failedJobRepository,
        chunkRepository,
        documentRelationRepository,
      )
    }
    const lifecycleStore = createWorker(true)
    const createClaimNext = (failReceiptSave = false) => {
      const store = createWorker()

      return new DispatchDocumentIndexingListener(
        store.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(store.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingUseCase(store.knowledgeBaseDocumentRepository),
        store.documentIndexRepository,
        store.jobRepository,
        store.failedJobRepository,
        config.workerLeaseSeconds,
        new ActivateKnowledgeBaseDocumentIndexUseCase(store.knowledgeBaseDocumentRepository),
        new GetIndexingKnowledgeBaseUseCase(store.knowledgeBaseRepository),
        failReceiptSave
          ? Object.assign(new DocumentIndexSuccessReceiptRepository(store.persistenceTransaction), {
              archiveSuccess: async () => {
                throw new Error('receipt save failed')
              },
            })
          : new DocumentIndexSuccessReceiptRepository(store.persistenceTransaction),
      )
    }
    const claimed = await Promise.all([createClaimNext().handle(), createClaimNext().handle()])
    assert.equal(claimed.filter(Boolean).length, 1)
    const claimedJob = await jobModelRepository.findOneByOrFail({ id: job.id })
    assert.deepEqual(
      claimed.map((claimedWorkerJob) => claimedWorkerJob?.id).filter((jobId) => jobId !== undefined),
      [job.id],
    )
    assert.equal(claimedJob.status, 'running')
    assert.equal(claimedJob.attempts, 1)
    assert.ok(claimedJob.reservedAt)
    assert.match(claimed[0]?.leaseToken ?? '', /^[0-9a-f-]{36}$/)
    assert.equal(claimedJob.executionVerification?.claim_token, claimed[0]?.leaseToken)
    assert.equal(claimedJob.executionVerification?.lease_expires_at, claimed[0]?.leaseExpiresAt.toISOString())
    assert.equal(claimed[0]?.executionVerification.claimToken, claimed[0]?.leaseToken)
    assert.equal(claimed[0]?.executionVerification.leaseExpiresAt, claimed[0]?.leaseExpiresAt.toISOString())
    const heartbeatNow = new Date()
    await lifecycleStore.persistenceTransaction.run(async () => {
      const currentJob = claimed[0]!
      assert.ok(await lifecycleStore.documentRepository.lockByDocumentId({ documentId: currentJob.documentId }))
      assert.ok(
        await lifecycleStore.knowledgeBaseDocumentRepository.lockByKnowledgeBaseIdAndDocumentId({
          knowledgeBaseId: currentJob.knowledgeBaseId,
          documentId: currentJob.documentId,
        }),
      )
      assert.ok(await lifecycleStore.jobRepository.lockExecution({ jobId: currentJob.id }))
      await lifecycleStore.jobRepository.renewLease({
        jobId: currentJob.id,
        reservedAt: heartbeatNow,
        leaseExpiresAt: new Date(heartbeatNow.getTime() + config.workerLeaseSeconds * 1000),
        executionVerification: {
          stage: DocumentIndexExecutionStageEnum.LOADING,
          completedUnits: 1,
          totalUnits: 3,
          verifiedAt: heartbeatNow.toISOString(),
          claimToken: currentJob.leaseToken,
          leaseExpiresAt: new Date(heartbeatNow.getTime() + config.workerLeaseSeconds * 1000).toISOString(),
        },
      })
    })
    const heartbeatJob = await jobModelRepository.findOneByOrFail({ id: job.id })
    assert.equal(heartbeatJob.leaseExpiresAt?.toISOString(), heartbeatJob.executionVerification?.lease_expires_at)
    assert.equal(heartbeatJob.executionVerification?.claim_token, claimed[0]?.leaseToken)
    assert.equal(
      heartbeatJob.executionVerification?.lease_expires_at,
      new Date(heartbeatJob.reservedAt!.getTime() + config.workerLeaseSeconds * 1000).toISOString(),
    )
    const jobStatus = await lifecycleStore.jobStatus({ projectId: base.projectId, jobId: job.id })
    assert.ok(jobStatus)
    assert.equal(jobStatus.requestedTarget?.executionVerification?.claimToken, claimed[0]?.leaseToken)
    assert.equal(
      jobStatus.requestedTarget?.executionVerification?.leaseExpiresAt,
      heartbeatJob.executionVerification?.lease_expires_at,
    )
    assert.deepEqual(
      await Promise.all(
        ineligibleJobs.map(
          async (ineligibleJob) => (await jobModelRepository.findOneByOrFail({ id: ineligibleJob.id })).status,
        ),
      ),
      [DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED, DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING],
    )

    await jobModelRepository.update(ineligibleJobs[0]!.id, { availableAt: new Date(Date.now() - 1000) })
    assert.equal(await createClaimNext().handle(), null, 'a second job must not claim an index being built')
    assert.equal((await jobModelRepository.findOneByOrFail({ id: ineligibleJobs[0]!.id })).status, 'queued')
    await jobModelRepository.update(ineligibleJobs[0]!.id, { availableAt: new Date(Date.now() + 60_000) })

    claimedJob.reservedAt = new Date(Date.now() - (config.workerLeaseSeconds + 1) * 1000)
    await jobModelRepository.save(claimedJob)
    assert.equal(
      await createClaimNext().handle(),
      null,
      'an old reservedAt must not expire a lease whose persisted expiry is still in the future',
    )
    claimedJob.leaseExpiresAt = new Date(Date.now() - 1000)
    claimedJob.executionVerification = {
      ...(claimedJob.executionVerification ?? {}),
      lease_expires_at: claimedJob.leaseExpiresAt.toISOString(),
    }
    await jobModelRepository.save(claimedJob)
    assert.equal(await createClaimNext().handle(), null, 'an expired lease must enter retry backoff')
    const queuedAfterExpiry = await jobModelRepository.findOneByOrFail({ id: job.id })
    assert.equal(queuedAfterExpiry.status, 'queued')
    assert.equal(queuedAfterExpiry.attempts, 1)
    assert.equal(queuedAfterExpiry.reservedAt, null)
    assert.equal(queuedAfterExpiry.leaseToken, null)
    assert.equal(queuedAfterExpiry.executionVerification, null)
    assert.equal(queuedAfterExpiry.leaseExpiresAt, null)
    assert.equal((queuedAfterExpiry.executionState?.lastError as { code: string }).code, 'INDEXING_LEASE_EXPIRED')
    assert.ok(queuedAfterExpiry.availableAt.getTime() > Date.now())
    await jobModelRepository.update(job.id, { availableAt: new Date(Date.now() - 1000) })
    const recovered = await createClaimNext().handle()
    assert.equal(recovered?.id, job.id)
    assert.equal(recovered?.attempts, 2)
    assert.ok(recovered?.leaseToken)
    assert.notEqual(recovered?.leaseToken, claimed[0]?.leaseToken)

    await assert.rejects(
      new DocumentIndexedListener(
        lifecycleStore.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
        lifecycleStore.jobRepository,
        lifecycleStore.documentIndexRepository,
        new CompleteKnowledgeBaseDocumentIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
        new GetIndexingKnowledgeBaseUseCase(lifecycleStore.knowledgeBaseRepository),
        new DocumentIndexSuccessReceiptRepository(lifecycleStore.persistenceTransaction),
      ).handle({ jobDelivery: claimed[0]!, completedAt: new Date() }),
      InvalidDocumentIndexExecutionLeaseException,
    )
    await assert.rejects(
      new DocumentIndexingFailedListener(
        lifecycleStore.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
        lifecycleStore.jobRepository,
        lifecycleStore.documentIndexRepository,
        lifecycleStore.failedJobRepository,
      ).handle({
        jobDelivery: claimed[0]!,
        failureDecision: (() => {
          const failedAt = new Date()
          const transition = new RagJobEntity({
            id: claimed[0]!.id,
            status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
            attempts: claimed[0]!.attempts,
            leaseExpiresAt: claimed[0]!.leaseExpiresAt,
          }).afterFailure({ errorMessage: 'stale worker', failedAt })

          return {
            errorCode: 'INDEXING_FAILED',
            errorMessage: transition.errorMessage,
            failedAt,
            retryAt: transition.retryAt,
          }
        })(),
      }),
      InvalidDocumentIndexExecutionLeaseException,
    )
    const stalePlan = createMarkdownChunkPlan('stale lease must not write')
    const stalePlanSavedAt = new Date()
    await assert.rejects(
      new ReplaceIndexChunkUseCase(
        lifecycleStore.persistenceTransaction,
        new AuthorizeDocumentIndexChunkReplacementUseCase(
          new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
          new ReserveKnowledgeBaseDocumentForIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
          lifecycleStore.jobRepository,
          lifecycleStore.documentIndexRepository,
        ),
        lifecycleStore.chunkRepository,
        new ReplacePlannedDocumentRelationsUseCase(lifecycleStore.documentRelationRepository),
      ).execute({
        job: claimed[0]!,
        markdownChunkPlan: stalePlan,
        chunkEmbeddings: [[0.1]],
        now: stalePlanSavedAt,
      }),
      InvalidDocumentIndexExecutionLeaseException,
    )
    assert.equal(await dataSource.getRepository(ChunkModel).countBy({ documentIndexId: index.id }), 0)
    assert.ok(await jobModelRepository.findOneBy({ id: job.id }), 'stale worker must not remove the active job')
    assert.equal((await documentIndexModelRepository.findOneByOrFail({ id: index.id })).status, 'building')

    const plan = createMarkdownChunkPlan('## Claim concurrency\n\nA document chunk proves the claimed job is indexed.')
    const vectors = plan.chunks.map((_, ordinal) =>
      Array.from({ length: config.embeddingDimensions }, (_, dimension) => (dimension === ordinal ? 1 : 0)),
    )
    await knowledgeBaseDocumentModelRepository.update(
      { knowledgeBaseId: base.id, documentId: document.id },
      { requestedGeneration: '2' },
    )
    await assert.rejects(
      new ReplaceIndexChunkUseCase(
        lifecycleStore.persistenceTransaction,
        new AuthorizeDocumentIndexChunkReplacementUseCase(
          new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
          new ReserveKnowledgeBaseDocumentForIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
          lifecycleStore.jobRepository,
          lifecycleStore.documentIndexRepository,
        ),
        lifecycleStore.chunkRepository,
        new ReplacePlannedDocumentRelationsUseCase(lifecycleStore.documentRelationRepository),
      ).execute({
        job: recovered!,
        markdownChunkPlan: plan,
        chunkEmbeddings: vectors,
        now: new Date(),
      }),
      InvalidDocumentIndexExecutionLeaseException,
    )
    await assert.rejects(
      new DocumentIndexedListener(
        lifecycleStore.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
        lifecycleStore.jobRepository,
        lifecycleStore.documentIndexRepository,
        new CompleteKnowledgeBaseDocumentIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
        new GetIndexingKnowledgeBaseUseCase(lifecycleStore.knowledgeBaseRepository),
        new DocumentIndexSuccessReceiptRepository(lifecycleStore.persistenceTransaction),
      ).handle({ jobDelivery: recovered!, completedAt: new Date() }),
      InvalidDocumentIndexExecutionLeaseException,
    )
    await assert.rejects(
      new DocumentIndexingFailedListener(
        lifecycleStore.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
        lifecycleStore.jobRepository,
        lifecycleStore.documentIndexRepository,
        lifecycleStore.failedJobRepository,
      ).handle({
        jobDelivery: recovered!,
        failureDecision: {
          errorCode: 'INDEXING_FAILED',
          errorMessage: 'superseded',
          failedAt: new Date(),
          retryAt: null,
        },
      }),
      InvalidDocumentIndexExecutionLeaseException,
    )
    assert.equal(await dataSource.getRepository(ChunkModel).countBy({ documentIndexId: index.id }), 0)
    assert.equal((await jobModelRepository.findOneByOrFail({ id: job.id })).attempts, 2)
    await knowledgeBaseDocumentModelRepository.update(
      { knowledgeBaseId: base.id, documentId: document.id },
      { requestedGeneration: '1' },
    )

    const liveClaim = await jobModelRepository.findOneByOrFail({ id: job.id })
    const liveVerification = liveClaim.executionVerification
    const liveLeaseExpiresAt = liveClaim.leaseExpiresAt
    liveClaim.leaseExpiresAt = new Date(Date.now() - 1000)
    liveClaim.executionVerification = {
      ...(liveVerification ?? {}),
      lease_expires_at: liveClaim.leaseExpiresAt.toISOString(),
    }
    await jobModelRepository.save(liveClaim)
    await assert.rejects(
      new ReplaceIndexChunkUseCase(
        lifecycleStore.persistenceTransaction,
        new AuthorizeDocumentIndexChunkReplacementUseCase(
          new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
          new ReserveKnowledgeBaseDocumentForIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
          lifecycleStore.jobRepository,
          lifecycleStore.documentIndexRepository,
        ),
        lifecycleStore.chunkRepository,
        new ReplacePlannedDocumentRelationsUseCase(lifecycleStore.documentRelationRepository),
      ).execute({
        job: recovered!,
        markdownChunkPlan: plan,
        chunkEmbeddings: vectors,
        now: new Date(Date.now() - 2000),
      }),
      InvalidDocumentIndexExecutionLeaseException,
    )
    await assert.rejects(
      new DocumentIndexedListener(
        lifecycleStore.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
        lifecycleStore.jobRepository,
        lifecycleStore.documentIndexRepository,
        new CompleteKnowledgeBaseDocumentIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
        new GetIndexingKnowledgeBaseUseCase(lifecycleStore.knowledgeBaseRepository),
        new DocumentIndexSuccessReceiptRepository(lifecycleStore.persistenceTransaction),
      ).handle({ jobDelivery: recovered!, completedAt: new Date(Date.now() - 2000) }),
      InvalidDocumentIndexExecutionLeaseException,
    )
    await assert.rejects(
      new DocumentIndexingFailedListener(
        lifecycleStore.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
        lifecycleStore.jobRepository,
        lifecycleStore.documentIndexRepository,
        lifecycleStore.failedJobRepository,
      ).handle({
        jobDelivery: recovered!,
        failureDecision: {
          errorCode: 'INDEXING_FAILED',
          errorMessage: 'expired worker',
          failedAt: new Date(Date.now() - 2000),
          retryAt: null,
        },
      }),
      InvalidDocumentIndexExecutionLeaseException,
    )
    assert.equal(await dataSource.getRepository(ChunkModel).countBy({ documentIndexId: index.id }), 0)
    assert.ok(await jobModelRepository.findOneBy({ id: job.id }), 'expired claim must not be completed or deleted')
    liveClaim.executionVerification = liveVerification
    liveClaim.leaseExpiresAt = liveLeaseExpiresAt
    await jobModelRepository.save(liveClaim)

    await jobModelRepository.update(job.id, { attempts: 4 })
    const terminalClaim = { ...recovered!, attempts: 4 }
    const removalFailure = new Error('terminal job removal failed')
    const failingJobs = Object.create(lifecycleStore.jobRepository) as JobRepository
    failingJobs.releaseExecution = () => Promise.reject(removalFailure)
    await assert.rejects(
      new DocumentIndexingFailedListener(
        lifecycleStore.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
        failingJobs,
        lifecycleStore.documentIndexRepository,
        lifecycleStore.failedJobRepository,
      ).handle({
        jobDelivery: terminalClaim,
        failureDecision: {
          errorCode: 'INDEXING_FAILED',
          errorMessage: 'transaction rollback',
          failedAt: new Date(),
          retryAt: null,
        },
      }),
      removalFailure,
    )
    assert.equal(await dataSource.getRepository(FailedJobModel).countBy({ jobId: job.id }), 0)
    assert.equal((await documentIndexModelRepository.findOneByOrFail({ id: index.id })).unreferencedSince, null)
    assert.equal(
      (await jobModelRepository.findOneByOrFail({ id: job.id })).status,
      DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    )
    assert.equal((await jobModelRepository.findOneByOrFail({ id: job.id })).attempts, 4)
    await jobModelRepository.update(job.id, { attempts: recovered!.attempts })

    const planSavedAt = new Date()
    await new ReplaceIndexChunkUseCase(
      lifecycleStore.persistenceTransaction,
      new AuthorizeDocumentIndexChunkReplacementUseCase(
        new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
        lifecycleStore.jobRepository,
        lifecycleStore.documentIndexRepository,
      ),
      lifecycleStore.chunkRepository,
      new ReplacePlannedDocumentRelationsUseCase(lifecycleStore.documentRelationRepository),
    ).execute({
      job: recovered!,
      markdownChunkPlan: plan,
      chunkEmbeddings: vectors,
      now: planSavedAt,
    })
    await new DocumentIndexedListener(
      lifecycleStore.persistenceTransaction,
      new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
      new ReserveKnowledgeBaseDocumentForIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
      lifecycleStore.jobRepository,
      lifecycleStore.documentIndexRepository,
      new CompleteKnowledgeBaseDocumentIndexingUseCase(lifecycleStore.knowledgeBaseDocumentRepository),
      new GetIndexingKnowledgeBaseUseCase(lifecycleStore.knowledgeBaseRepository),
      new DocumentIndexSuccessReceiptRepository(lifecycleStore.persistenceTransaction),
    ).handle({ jobDelivery: recovered!, completedAt: new Date() })
    await jobModelRepository.update(ineligibleJobs[0]!.id, { availableAt: new Date(Date.now() - 1000) })
    await documentIndexModelRepository.update(index.id, {
      unreferencedSince: new Date(Date.now() - config.gcRetentionMs - 1000),
    })
    await assert.rejects(createClaimNext(true).handle(), { message: 'receipt save failed' })
    assert.ok(await jobModelRepository.findOneBy({ id: ineligibleJobs[0]!.id }))
    assert.equal(
      (
        await knowledgeBaseDocumentModelRepository.findOneByOrFail({
          knowledgeBaseId: ineligibleKnowledgeBases[0]!.id,
          documentId: document.id,
        })
      ).activeDocumentIndexId,
      null,
      'a receipt failure must roll back shared index activation',
    )
    assert.equal(await createClaimNext().handle(), null, 'ready shared indexes should activate without rebuilding')
    assert.equal(
      (await documentIndexModelRepository.findOneByOrFail({ id: index.id })).unreferencedSince,
      null,
      'claiming a ready shared index must clear its stale unreferenced marker',
    )
    assert.equal(await jobModelRepository.findOneBy({ id: ineligibleJobs[0]!.id }), null)
    const reusedReceipt = await new DocumentIndexSuccessReceiptRepository(
      lifecycleStore.persistenceTransaction,
    ).findSuccessByProjectIdAndJobId({
      projectId: ineligibleKnowledgeBases[0]!.projectId,
      jobId: ineligibleJobs[0]!.id,
    })
    assert.ok(reusedReceipt, 'the issued shared-index job must remain queryable after deletion')
    assert.equal(reusedReceipt.documentIndexId, index.id)
    assert.equal(reusedReceipt.knowledgeBaseId, ineligibleKnowledgeBases[0]!.id)
    assert.equal(reusedReceipt.generation, '1')
    assert.equal(reusedReceipt.attempts, 0)
    assert.equal(reusedReceipt.executionVerification, null, 'reuse does not attest provider execution')

    assert.equal(await jobModelRepository.findOneBy({ id: job.id }), null)
    assert.equal((await documentIndexModelRepository.findOneByOrFail({ id: index.id })).status, 'ready')
    assert.equal(
      (
        await knowledgeBaseDocumentModelRepository.findOneByOrFail({
          knowledgeBaseId: base.id,
          documentId: document.id,
        })
      ).activeDocumentIndexId,
      index.id,
    )
    const retrievalSnapshot = await lifecycleStore.loadSnapshot(
      {
        projectId: base.projectId,
        includeNonEffective: false,
        lexicalTerms: ['claimed', 'document'],
      },
      {
        snapshotLexicalLimit: 5,
        vectorCandidateLimit: 20,
        lexicalCandidateLimit: 20,
      },
    )
    assert.equal(retrievalSnapshot.knowledgeBaseId, base.id)
    assert.equal(retrievalSnapshot.chunks.length, 1)
    const retrievedKnowledgeBase = await lifecycleStore
      .createRetrievalUseCase(
        {
          modelId: index.embeddingModel,
          embed: () => Promise.reject(new Error('supplied query vector must avoid embedding calls')),
        },
        {
          chunkingModel: index.chunkingModel,
          chunkingProfile: index.chunkingProfile,
          embeddingProfile: index.embeddingProfile,
          lexicalProfile: index.lexicalProfile,
          relationProfile: index.relationProfile,
        },
      )
      .execute({
        projectId: base.projectId,
        documentReference: document.sourcePath,
        queryText: 'claimed document',
        queryVector: vectors[0]!,
        embeddingModelId: index.embeddingModel,
      })
    const retrieval = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(retrievedKnowledgeBase)
    assert.deepEqual(
      retrieval.matches.map((match) => match.chunk.id),
      [retrievalSnapshot.chunks[0]!.id],
    )
    const match = retrieval.matches[0]!
    assert.equal(match.chunk.activeDocumentIndexId, index.id)
    assert.equal(match.lexicalRank, 1)
    assert.ok(match.rawLexicalScore! > 0)
    assert.equal(match.semanticRank, 1)
    assert.equal(match.matchType, 'hybrid')
    assert.equal(match.chunk.isEffective, true)

    const terminalLeaseExpiresAt = new Date(Date.now() - 1000)
    await jobModelRepository.update(ineligibleJobs[1]!.id, {
      attempts: 4,
      reservedAt: new Date(Date.now() - (config.workerLeaseSeconds + 1) * 1000),
      executionState: { completedUnits: 2 },
      leaseExpiresAt: terminalLeaseExpiresAt,
      executionVerification: {
        claim_token: randomUUID(),
        lease_expires_at: terminalLeaseExpiresAt.toISOString(),
      },
    })
    assert.equal(await createClaimNext().handle(), null)
    assert.equal(await jobModelRepository.findOneBy({ id: ineligibleJobs[1]!.id }), null)
    const expiredFailure = await dataSource
      .getRepository(FailedJobModel)
      .findOneByOrFail({ jobId: ineligibleJobs[1]!.id })
    assert.ok(
      (await documentIndexModelRepository.findOneByOrFail({ id: unrelatedIndex.id })).unreferencedSince,
      'terminal expired lease should make its index eligible for retention after the failed-job reference expires',
    )
    assert.equal(expiredFailure.attempts, 4)
    assert.equal(expiredFailure.errorCode, 'INDEXING_LEASE_EXPIRED')
    assert.deepEqual(expiredFailure.retryPayload.executionState, {
      completedUnits: 2,
      lastError: {
        code: 'INDEXING_LEASE_EXPIRED',
        message: 'Indexing worker lease expired after the final attempt',
        failedAt: expiredFailure.failedAt.toISOString(),
      },
    })

    await documentIndexModelRepository.update(index.id, { status: DocumentIndexStatusEnum.BUILDING, readyAt: null })
    await knowledgeBaseDocumentModelRepository.update(
      { knowledgeBaseId: base.id, documentId: document.id },
      { requestedGeneration: '2' },
    )
    await knowledgeBaseDocumentModelRepository.update(
      { knowledgeBaseId: ineligibleKnowledgeBases[0]!.id, documentId: document.id },
      { requestedGeneration: '2' },
    )
    await knowledgeBaseDocumentModelRepository.update(
      { knowledgeBaseId: ineligibleKnowledgeBases[1]!.id, documentId: document.id },
      { requestedGeneration: '2' },
    )
    const blockedJob = await jobModelRepository.save(
      jobModelRepository.create({
        knowledgeBaseId: ineligibleKnowledgeBases[0]!.id,
        documentId: document.id,
        documentIndexId: unrelatedIndex.id,
        generation: '2',
        status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
        attempts: 0,
        availableAt: new Date(Date.now() - 1000),
        reservedAt: null,
        leaseToken: null,
        idempotencyKey: null,
        retryOfFailedJobId: null,
        payload: {},
        executionState: null,
        executionVerification: null,
        leaseExpiresAt: null,
      }),
    )
    const eligibleJob = await jobModelRepository.save(
      jobModelRepository.create({
        knowledgeBaseId: base.id,
        documentId: document.id,
        documentIndexId: index.id,
        generation: '2',
        status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
        attempts: 0,
        availableAt: new Date(Date.now() - 1000),
        reservedAt: null,
        leaseToken: null,
        idempotencyKey: null,
        retryOfFailedJobId: null,
        payload: {},
        executionState: null,
        executionVerification: null,
        leaseExpiresAt: null,
      }),
    )
    const blockedLeaseToken = randomUUID()
    const blockedLeaseExpiresAt = new Date(Date.now() + config.workerLeaseSeconds * 1000)
    await jobModelRepository.save(
      jobModelRepository.create({
        knowledgeBaseId: ineligibleKnowledgeBases[1]!.id,
        documentId: document.id,
        documentIndexId: unrelatedIndex.id,
        generation: '2',
        status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
        attempts: 1,
        availableAt: new Date(Date.now() - 1000),
        reservedAt: new Date(),
        leaseToken: blockedLeaseToken,
        leaseExpiresAt: blockedLeaseExpiresAt,
        idempotencyKey: null,
        retryOfFailedJobId: null,
        payload: {},
        executionState: null,
        executionVerification: {
          claim_token: blockedLeaseToken,
          lease_expires_at: blockedLeaseExpiresAt.toISOString(),
        },
      }),
    )
    const claimedAfterBlockedSibling = await createClaimNext().handle()
    assert.equal(claimedAfterBlockedSibling?.id, eligibleJob.id)
    assert.equal((await jobModelRepository.findOneByOrFail({ id: blockedJob.id })).status, 'queued')
  } finally {
    await cleanup()
  }
})

async function createReadyIndexReuseFixture(dataSource: DataSource) {
  const testKey = randomUUID()
  const base = {
    id: randomUUID(),
    projectId: `ready-reuse-${testKey}`,
    projectName: `ready-reuse-${testKey}`,
  } satisfies Partial<KnowledgeBaseModel>
  await dataSource.getRepository(KnowledgeBaseModel).insert(base)
  const document = {
    id: randomUUID(),
    sourceType: 'repository',
    sourceKey: testKey,
    sourcePath: `${testKey}.md`,
    unreferencedSince: null,
  } satisfies Partial<DocumentModel>
  await dataSource.getRepository(DocumentModel).insert(document)
  const revision = {
    id: randomUUID(),
    documentId: document.id,
    contentSha256: 'a'.repeat(64),
    title: 'shared READY reuse',
    content: 'shared READY reuse',
  } satisfies Partial<DocumentRevisionModel>
  await dataSource.getRepository(DocumentRevisionModel).insert(revision)
  const unreferencedSince = new Date('2026-01-01T00:00:00.000Z')
  const index = {
    id: randomUUID(),
    documentId: document.id,
    revisionId: revision.id,
    pipelineHash: 'b'.repeat(64),
    chunkingModel: 'test',
    chunkingProfile: 'test',
    embeddingModel: config.embeddingModel,
    embeddingDimensions: config.embeddingDimensions,
    embeddingProfile: 'test',
    lexicalProfile: lexicalFormatter.format('shared READY reuse').profileVersion,
    relationProfile: 'test',
    status: DocumentIndexStatusEnum.READY,
    readyAt: unreferencedSince,
    unreferencedSince,
  } satisfies Partial<DocumentIndexModel>
  await dataSource.getRepository(DocumentIndexModel).insert(index)
  const membership = {
    knowledgeBaseId: base.id,
    documentId: document.id,
    activeDocumentIndexId: null,
    requestedGeneration: '2',
    isEntry: false,
    alwaysIncludeFullContent: false,
  } satisfies Partial<KnowledgeBaseDocumentModel>
  await dataSource.getRepository(KnowledgeBaseDocumentModel).insert(membership)
  const job = {
    id: randomUUID(),
    knowledgeBaseId: base.id,
    documentId: document.id,
    documentIndexId: index.id,
    generation: '2',
    status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
    attempts: 2,
    availableAt: new Date(Date.now() - 1000),
    reservedAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    idempotencyKey: null,
    retryOfFailedJobId: null,
    payload: {},
    executionState: null,
    executionVerification: null,
  } satisfies Partial<JobModel>
  await dataSource.getRepository(JobModel).insert(job)
  const persistenceTransaction = new PersistenceTransaction(dataSource)
  const jobRepository = new JobRepository(persistenceTransaction)
  const successReceiptRepository = new DocumentIndexSuccessReceiptRepository(persistenceTransaction)
  const knowledgeBaseDocumentRepository = new KnowledgeBaseDocumentRepository(persistenceTransaction)
  const dispatcher = new DispatchDocumentIndexingListener(
    persistenceTransaction,
    new ReserveDocumentForIndexingUseCase(new DocumentRepository(persistenceTransaction)),
    new ReserveKnowledgeBaseDocumentForIndexingUseCase(knowledgeBaseDocumentRepository),
    new DocumentIndexRepository(persistenceTransaction),
    jobRepository,
    new FailedJobRepository(persistenceTransaction),
    config.workerLeaseSeconds,
    new ActivateKnowledgeBaseDocumentIndexUseCase(knowledgeBaseDocumentRepository),
    new GetIndexingKnowledgeBaseUseCase(new KnowledgeBaseRepository(persistenceTransaction)),
    successReceiptRepository,
  )

  return {
    base,
    document,
    index,
    membership,
    job,
    persistenceTransaction,
    jobRepository,
    successReceiptRepository,
    dispatcher,
  }
}

test(
  'shared READY activation preserves nonzero job attempts in its success receipt',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createPersistenceTestDatabase()

    try {
      const fixture = await createReadyIndexReuseFixture(dataSource)
      assert.equal(await fixture.dispatcher.handle(), null)

      const receipt = await fixture.successReceiptRepository.findSuccessByProjectIdAndJobId({
        projectId: fixture.base.projectId,
        jobId: fixture.job.id,
      })
      assert.ok(receipt)
      assert.equal(receipt.projectId, fixture.base.projectId)
      assert.equal(receipt.jobId, fixture.job.id)
      assert.equal(receipt.knowledgeBaseId, fixture.base.id)
      assert.equal(receipt.documentId, fixture.document.id)
      assert.equal(receipt.documentIndexId, fixture.index.id)
      assert.equal(receipt.generation, fixture.job.generation)
      assert.equal(receipt.attempts, 2)
      assert.equal(receipt.executionVerification, null)
      assert.equal(await dataSource.getRepository(JobModel).findOneBy({ id: fixture.job.id }), null)
      const membership = await dataSource.getRepository(KnowledgeBaseDocumentModel).findOneByOrFail({
        knowledgeBaseId: fixture.base.id,
        documentId: fixture.document.id,
      })
      assert.equal(membership.activeDocumentIndexId, fixture.index.id)
      assert.equal(membership.requestedGeneration, fixture.job.generation)
      assert.equal(
        (await dataSource.getRepository(DocumentIndexModel).findOneByOrFail({ id: fixture.index.id }))
          .unreferencedSince,
        null,
      )
    } finally {
      await cleanup()
    }
  },
)

test(
  'shared READY activation rolls back a saved receipt when queued-job CAS deletion fails',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createPersistenceTestDatabase()

    try {
      const fixture = await createReadyIndexReuseFixture(dataSource)
      const originalJob = await dataSource.getRepository(JobModel).findOneByOrFail({ id: fixture.job.id })
      const originalMembership = await dataSource.getRepository(KnowledgeBaseDocumentModel).findOneByOrFail({
        knowledgeBaseId: fixture.base.id,
        documentId: fixture.document.id,
      })
      const originalIndex = await dataSource.getRepository(DocumentIndexModel).findOneByOrFail({ id: fixture.index.id })
      let observedSavedReceipt = false
      Object.assign(fixture.jobRepository, {
        releaseQueuedExecution: async () => {
          const receipt = await fixture.successReceiptRepository.findSuccessByProjectIdAndJobId({
            projectId: fixture.base.projectId,
            jobId: fixture.job.id,
          })
          assert.ok(receipt, 'the real receipt must be saved before the CAS failure')
          assert.equal(receipt.attempts, 2)
          assert.equal(receipt.executionVerification, null)
          const manager = fixture.persistenceTransaction.manager
          const activatedMembership = await manager.getRepository(KnowledgeBaseDocumentModel).findOneByOrFail({
            knowledgeBaseId: fixture.base.id,
            documentId: fixture.document.id,
          })
          assert.equal(activatedMembership.activeDocumentIndexId, fixture.index.id)
          assert.equal(
            (await manager.getRepository(DocumentIndexModel).findOneByOrFail({ id: fixture.index.id }))
              .unreferencedSince,
            null,
          )
          observedSavedReceipt = true
          // Force a real conditional-delete miss after archiveSuccess has written in this transaction.
          const deletion = await manager.getRepository(JobModel).delete({
            id: fixture.job.id,
            status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
          })
          assert.equal(deletion.affected, 0)

          return false
        },
      })

      await assert.rejects(fixture.dispatcher.handle(), DocumentIndexExecutionClaimConflictException)
      assert.equal(observedSavedReceipt, true)
      assert.equal(
        await fixture.successReceiptRepository.findSuccessByProjectIdAndJobId({
          projectId: fixture.base.projectId,
          jobId: fixture.job.id,
        }),
        null,
      )
      assert.deepEqual(await dataSource.getRepository(JobModel).findOneByOrFail({ id: fixture.job.id }), originalJob)
      assert.deepEqual(
        await dataSource.getRepository(KnowledgeBaseDocumentModel).findOneByOrFail({
          knowledgeBaseId: fixture.base.id,
          documentId: fixture.document.id,
        }),
        originalMembership,
      )
      assert.deepEqual(
        await dataSource.getRepository(DocumentIndexModel).findOneByOrFail({ id: fixture.index.id }),
        originalIndex,
      )
    } finally {
      await cleanup()
    }
  },
)
