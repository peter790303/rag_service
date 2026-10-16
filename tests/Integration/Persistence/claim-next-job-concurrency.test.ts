import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/Chunks/UseCases/replace-index-chunk.use-case.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/Application/DocumentIndexes/Enums/document-index-execution-stage.enum.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-document-index-execution-lease.exception.ts'
import {
  DocumentIndexExecutionLifecycle as RagJobEntity,
  DOCUMENT_INDEX_EXECUTION_STATUS,
} from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { DispatchDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/dispatch-document-indexing.listener.ts'
import { DocumentIndexChunkReplacementRequestedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-index-chunk-replacement-requested.listener.ts'
import { DocumentIndexedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexed.listener.ts'
import { DocumentIndexingFailedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexing-failed.listener.ts'
import { ReplacePlannedDocumentRelationsUseCase } from '../../../src/Application/DocumentRelations/UseCases/replace-planned-document-relations.use-case.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import { ActivateMembershipIndexUseCase } from '../../../src/Application/Memberships/UseCases/activate-membership-index.use-case.ts'
import { CompleteMembershipIndexingUseCase } from '../../../src/Application/Memberships/UseCases/complete-membership-indexing.use-case.ts'
import { ReserveMembershipForIndexingUseCase } from '../../../src/Application/Memberships/UseCases/reserve-membership-for-indexing.use-case.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { LexicalSearchQueryAdapter } from '../../../src/Infrastructure/Persistence/Adapters/lexical-search-query.adapter.ts'
import { ChunkModel } from '../../../src/Infrastructure/Persistence/Models/chunk.model.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { FailedJobModel } from '../../../src/Infrastructure/Persistence/Models/failed-job.model.ts'
import { JobModel } from '../../../src/Infrastructure/Persistence/Models/job.model.ts'
import { KnowledgeBaseDocumentMembershipModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document-membership.model.ts'
import { KnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'
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
  embeddingApiUrl: 'https://unused.invalid',
  chunkingModel: 'integration-test-chunker',
  chunkingApiUrl: 'https://unused.invalid',
  workerPollMs: 1000,
  gcPollMs: 60000,
  gcRetentionMs: 86400000,
  workerLeaseSeconds: 30,
  serviceAuthSecret: 'integration-test-secret',
}

test('concurrent workers claim a queued job exactly once', { skip: !process.env.RAG_DATABASE_URL }, async () => {
  const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()

  try {
    const knowledgeBaseModelRepository = dataSource.getRepository(KnowledgeBaseModel)
    const documentModelRepository = dataSource.getRepository(DocumentModel)
    const documentRevisionModelRepository = dataSource.getRepository(DocumentRevisionModel)
    const documentIndexModelRepository = dataSource.getRepository(DocumentIndexModel)
    const membershipModelRepository = dataSource.getRepository(KnowledgeBaseDocumentMembershipModel)
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
    await membershipModelRepository.save(
      membershipModelRepository.create({
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
    await membershipModelRepository.save(
      ineligibleKnowledgeBases.map((ineligibleKnowledgeBase) =>
        membershipModelRepository.create({
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
      const membershipRepository = new KnowledgeBaseDocumentMembershipRepository(persistenceTransaction)

      return new DocumentIndexPersistenceFixture(
        persistenceTransaction,
        jobRepository,
        membershipRepository,
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
    const createClaimNext = () => {
      const store = createWorker()

      return new DispatchDocumentIndexingListener(
        store.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(store.documentRepository),
        new ReserveMembershipForIndexingUseCase(store.membershipRepository),
        store.documentIndexRepository,
        store.jobRepository,
        store.failedJobRepository,
        config.workerLeaseSeconds,
        new ActivateMembershipIndexUseCase(store.membershipRepository),
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
        await lifecycleStore.membershipRepository.lockByKnowledgeBaseIdAndDocumentId({
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
        new ReserveMembershipForIndexingUseCase(lifecycleStore.membershipRepository),
        lifecycleStore.jobRepository,
        lifecycleStore.documentIndexRepository,
        new CompleteMembershipIndexingUseCase(lifecycleStore.membershipRepository),
      ).handle({ jobDelivery: claimed[0]!, completedAt: new Date() }),
      InvalidDocumentIndexExecutionLeaseException,
    )
    await assert.rejects(
      new DocumentIndexingFailedListener(
        lifecycleStore.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
        new ReserveMembershipForIndexingUseCase(lifecycleStore.membershipRepository),
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
        new DocumentIndexChunkReplacementRequestedListener(
          new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
          new ReserveMembershipForIndexingUseCase(lifecycleStore.membershipRepository),
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
    await membershipModelRepository.update(
      { knowledgeBaseId: base.id, documentId: document.id },
      { requestedGeneration: '2' },
    )
    await assert.rejects(
      new ReplaceIndexChunkUseCase(
        lifecycleStore.persistenceTransaction,
        new DocumentIndexChunkReplacementRequestedListener(
          new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
          new ReserveMembershipForIndexingUseCase(lifecycleStore.membershipRepository),
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
        new ReserveMembershipForIndexingUseCase(lifecycleStore.membershipRepository),
        lifecycleStore.jobRepository,
        lifecycleStore.documentIndexRepository,
        new CompleteMembershipIndexingUseCase(lifecycleStore.membershipRepository),
      ).handle({ jobDelivery: recovered!, completedAt: new Date() }),
      InvalidDocumentIndexExecutionLeaseException,
    )
    await assert.rejects(
      new DocumentIndexingFailedListener(
        lifecycleStore.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
        new ReserveMembershipForIndexingUseCase(lifecycleStore.membershipRepository),
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
    await membershipModelRepository.update(
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
        new DocumentIndexChunkReplacementRequestedListener(
          new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
          new ReserveMembershipForIndexingUseCase(lifecycleStore.membershipRepository),
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
        new ReserveMembershipForIndexingUseCase(lifecycleStore.membershipRepository),
        lifecycleStore.jobRepository,
        lifecycleStore.documentIndexRepository,
        new CompleteMembershipIndexingUseCase(lifecycleStore.membershipRepository),
      ).handle({ jobDelivery: recovered!, completedAt: new Date(Date.now() - 2000) }),
      InvalidDocumentIndexExecutionLeaseException,
    )
    await assert.rejects(
      new DocumentIndexingFailedListener(
        lifecycleStore.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
        new ReserveMembershipForIndexingUseCase(lifecycleStore.membershipRepository),
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
        new ReserveMembershipForIndexingUseCase(lifecycleStore.membershipRepository),
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
      new DocumentIndexChunkReplacementRequestedListener(
        new ReserveDocumentForIndexingUseCase(lifecycleStore.documentRepository),
        new ReserveMembershipForIndexingUseCase(lifecycleStore.membershipRepository),
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
      new ReserveMembershipForIndexingUseCase(lifecycleStore.membershipRepository),
      lifecycleStore.jobRepository,
      lifecycleStore.documentIndexRepository,
      new CompleteMembershipIndexingUseCase(lifecycleStore.membershipRepository),
    ).handle({ jobDelivery: recovered!, completedAt: new Date() })
    await jobModelRepository.update(ineligibleJobs[0]!.id, { availableAt: new Date(Date.now() - 1000) })
    await documentIndexModelRepository.update(index.id, {
      unreferencedSince: new Date(Date.now() - config.gcRetentionMs - 1000),
    })
    assert.equal(await createClaimNext().handle(), null, 'ready shared indexes should activate without rebuilding')
    assert.equal(
      (await documentIndexModelRepository.findOneByOrFail({ id: index.id })).unreferencedSince,
      null,
      'claiming a ready shared index must clear its stale unreferenced marker',
    )
    assert.equal(await jobModelRepository.findOneBy({ id: ineligibleJobs[0]!.id }), null)
    assert.equal(await jobModelRepository.findOneBy({ id: job.id }), null)
    assert.equal((await documentIndexModelRepository.findOneByOrFail({ id: index.id })).status, 'ready')
    assert.equal(
      (await membershipModelRepository.findOneByOrFail({ knowledgeBaseId: base.id, documentId: document.id }))
        .activeDocumentIndexId,
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
    await membershipModelRepository.update(
      { knowledgeBaseId: base.id, documentId: document.id },
      { requestedGeneration: '2' },
    )
    await membershipModelRepository.update(
      { knowledgeBaseId: ineligibleKnowledgeBases[0]!.id, documentId: document.id },
      { requestedGeneration: '2' },
    )
    await membershipModelRepository.update(
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
