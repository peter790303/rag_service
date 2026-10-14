import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { RagConfig } from '../../../config/rag.config.js'
import {
  RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS,
  type RetryFailedJobAtomicallyInput,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-job-management.js'
import { ClaimNextRagJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/claim-next-rag-job.use-case.js'
import { CollectRagGarbageUseCase } from '../../../src/Application/KnowledgeBases/UseCases/collect-rag-garbage.use-case.js'
import { FailRagIndexJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/fail-rag-index-job.use-case.js'
import { PruneRagMembershipsUseCase } from '../../../src/Application/KnowledgeBases/UseCases/prune-rag-memberships.use-case.js'
import { RAG_DOCUMENT_INDEX_STATUS } from '../../../src/Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { RagJob as RagJobEntity, RAG_JOB_STATUS } from '../../../src/Domain/Knowledge/rag-job.js'
import { NodeRagCryptographyAdapter } from '../../../src/Infrastructure/External/Cryptography/Adapter/node-rag-cryptography.adapter.js'
import { RagChunkModel } from '../../../src/Infrastructure/Persistence/Models/rag-chunk.model.js'
import { RagDocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/rag-document-index.model.js'
import { RagDocumentRelationModel } from '../../../src/Infrastructure/Persistence/Models/rag-document-relation.model.js'
import { RagDocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/rag-document-revision.model.js'
import { RagDocumentModel } from '../../../src/Infrastructure/Persistence/Models/rag-document.model.js'
import { RagFailedJobModel } from '../../../src/Infrastructure/Persistence/Models/rag-failed-job.model.js'
import { RagJobModel } from '../../../src/Infrastructure/Persistence/Models/rag-job.model.js'
import { RagKnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/rag-knowledge-base.model.js'
import { RagMembershipModel } from '../../../src/Infrastructure/Persistence/Models/rag-membership.model.js'
import { TypeOrmRagChunkRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-chunk.repository.js'
import { TypeOrmRagDocumentIndexRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-document-index.repository.js'
import { TypeOrmRagDocumentRelationRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-document-relation.repository.js'
import { TypeOrmRagDocumentRevisionRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-document-revision.repository.js'
import { TypeOrmRagDocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-document.repository.js'
import { TypeOrmRagFailedJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-failed-job.repository.js'
import { TypeOrmRagJobClaimRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-job-claim.repository.js'
import { TypeOrmRagJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-job.repository.js'
import { TypeOrmRagKnowledgeBaseRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-knowledge-base.repository.js'
import { TypeOrmRagMembershipRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-membership.repository.js'
import { TypeOrmRagRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag.repository.js'
import { createTestDatabase } from '../test-database.js'

const config: RagConfig = {
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

const failureDecision = (
  job: { id: string; attempts: number; leaseExpiresAt: Date | null },
  errorCode: string,
  errorMessage: string,
) => {
  const failedAt = new Date(Date.now() - 60_000)
  const transition = new RagJobEntity({
    id: job.id,
    status: RAG_JOB_STATUS.RUNNING,
    attempts: job.attempts,
    leaseExpiresAt: job.leaseExpiresAt,
  }).afterFailure({ errorMessage, failedAt })

  return { errorCode, errorMessage: transition.errorMessage, failedAt, retryAt: transition.retryAt }
}

test(
  'job failure lifecycle: 3 retries then terminal archive, followed by manual retry',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createTestDatabase()
    try {
      const knowledgeBases = dataSource.getRepository(RagKnowledgeBaseModel)
      const documents = dataSource.getRepository(RagDocumentModel)
      const revisions = dataSource.getRepository(RagDocumentRevisionModel)
      const indexes = dataSource.getRepository(RagDocumentIndexModel)
      const memberships = dataSource.getRepository(RagMembershipModel)
      const jobs = dataSource.getRepository(RagJobModel)
      const failedJobs = dataSource.getRepository(RagFailedJobModel)

      const chunkRepository = new TypeOrmRagChunkRepository()
      const relationRepository = new TypeOrmRagDocumentRelationRepository()
      const documentIndexRepository = new TypeOrmRagDocumentIndexRepository(indexes)
      const failedJobRepository = new TypeOrmRagFailedJobRepository(failedJobs)
      const jobRepository = new TypeOrmRagJobRepository(jobs)
      const membershipRepository = new TypeOrmRagMembershipRepository(memberships)
      const kbRepository = new TypeOrmRagKnowledgeBaseRepository(knowledgeBases)
      const docRepository = new TypeOrmRagDocumentRepository(documents)
      const revRepository = new TypeOrmRagDocumentRevisionRepository(revisions)

      const repository = new TypeOrmRagRepository(
        indexes,
        jobRepository,
        membershipRepository,
        documentIndexRepository,
        kbRepository,
        docRepository,
        revRepository,
        failedJobRepository,
        chunkRepository,
        relationRepository,
        new TypeOrmRagJobClaimRepository(jobs),
      )
      const claimNext = () =>
        new ClaimNextRagJobUseCase(repository, new NodeRagCryptographyAdapter(), config.workerLeaseSeconds)

      const testKey = randomUUID()
      const base = await knowledgeBases.save(
        knowledgeBases.create({ projectId: `retry-${testKey}`, projectName: `retry-test-${testKey}` }),
      )
      const doc = await documents.save(
        documents.create({
          sourceType: RagSourceTypeEnum.REPOSITORY,
          sourceKey: testKey,
          sourcePath: `docs/${testKey}.md`,
          unreferencedSince: null,
        }),
      )
      const rev = await revisions.save(
        revisions.create({
          documentId: doc.id,
          contentSha256: 'c'.repeat(64),
          title: 'Retry Test Document',
          content: '# Retry Test Content\n\nTesting retry lifecycle and archiving.',
        }),
      )
      const idx = await indexes.save(
        indexes.create({
          documentId: doc.id,
          revisionId: rev.id,
          pipelineHash: 'd'.repeat(64),
          chunkingModel: 'integration-test-chunker',
          chunkingProfile: 'test',
          embeddingModel: 'integration-test-model',
          embeddingDimensions: 384,
          embeddingProfile: 'test',
          lexicalProfile: 'test',
          relationProfile: 'test',
          status: RAG_DOCUMENT_INDEX_STATUS.BUILDING,
          readyAt: null,
          unreferencedSince: null,
        }),
      )
      await memberships.save(
        memberships.create({
          knowledgeBaseId: base.id,
          documentId: doc.id,
          activeDocumentIndexId: null,
          requestedGeneration: '1',
          isEntry: true,
          alwaysIncludeFullContent: false,
        }),
      )
      const initialJob = await jobs.save(
        jobs.create({
          knowledgeBaseId: base.id,
          documentId: doc.id,
          documentIndexId: idx.id,
          generation: '1',
          status: RAG_JOB_STATUS.QUEUED,
          attempts: 0,
          availableAt: new Date(Date.now() - 1000),
          reservedAt: null,
          idempotencyKey: null,
          retryOfFailedJobId: null,
          payload: { content: rev.content },
          executionState: null,
          executionVerification: null,
        }),
      )

      // Attempt 1
      const claim1 = await claimNext().execute()
      assert.ok(claim1)
      assert.equal(claim1.id, initialJob.id)
      assert.equal(claim1.attempts, 1)
      await new FailRagIndexJobUseCase(repository).execute(claim1, {
        ...failureDecision(claim1, 'API_TIMEOUT', 'First attempt timed out'),
      })
      const jobAfter1 = await jobs.findOneByOrFail({ id: initialJob.id })
      assert.equal(jobAfter1.status, 'queued')
      assert.equal(jobAfter1.attempts, 1)
      const firstError = jobAfter1.executionState?.lastError as
        { code: string; message: string; failedAt: string } | undefined
      assert.equal(firstError?.code, 'API_TIMEOUT')
      assert.equal(firstError?.message, 'First attempt timed out')
      assert.match(firstError?.failedAt ?? '', /^\d{4}-\d{2}-\d{2}T/)
      assert.equal(jobAfter1.reservedAt, null)
      assert.equal(jobAfter1.executionVerification, null)
      assert.equal(await failedJobs.countBy({ jobId: initialJob.id }), 0)

      // Attempt 2
      const claim2 = await claimNext().execute()
      assert.ok(claim2)
      assert.equal(claim2.attempts, 2)
      await new FailRagIndexJobUseCase(repository).execute(claim2, {
        ...failureDecision(claim2, 'RATE_LIMITED', 'Second attempt rate limited'),
      })
      const jobAfter2 = await jobs.findOneByOrFail({ id: initialJob.id })
      assert.equal(jobAfter2.status, 'queued')
      assert.equal(jobAfter2.attempts, 2)

      // Attempt 3
      const claim3 = await claimNext().execute()
      assert.ok(claim3)
      assert.equal(claim3.attempts, 3)
      await new FailRagIndexJobUseCase(repository).execute(claim3, {
        ...failureDecision(claim3, 'SERVICE_UNAVAILABLE', 'Third attempt unavailable'),
      })
      const jobAfter3 = await jobs.findOneByOrFail({ id: initialJob.id })
      assert.equal(jobAfter3.status, 'queued')
      assert.equal(jobAfter3.attempts, 3)

      // Attempt 4 (Final attempt -> Terminal archive)
      const claim4 = await claimNext().execute()
      assert.ok(claim4)
      assert.equal(claim4.attempts, 4)
      await new FailRagIndexJobUseCase(repository).execute(claim4, {
        ...failureDecision(claim4, 'FATAL_MODEL_ERROR', 'Fourth attempt failed permanently'),
      })

      // jobs table must no longer have the job
      assert.equal(await jobs.findOneBy({ id: initialJob.id }), null)

      // failed_jobs table must have the archived failure
      const failedJobRecord = await failedJobs.findOneByOrFail({ jobId: initialJob.id })
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

      const laterRevision = await revisions.save(
        revisions.create({
          documentId: doc.id,
          contentSha256: 'e'.repeat(64),
          title: 'Later Source Revision',
          content: '# Later Source Revision\n\nThis revision is newer but is not the failed job target.',
        }),
      )
      const latestCreatedRevision = await revisions.findOne({
        where: { documentId: doc.id },
        order: { createdAt: 'DESC' },
      })
      assert.equal(latestCreatedRevision?.id, laterRevision.id)

      // Read retry context through repository
      const retryContext = await repository.readRetryContext(failedJobRecord.id)
      assert.ok(retryContext)
      assert.equal(retryContext.failedJob.id, failedJobRecord.id)
      assert.equal(retryContext.failedJob.attempts, 4)
      assert.equal(retryContext.knowledgeBase.projectId, base.projectId)
      assert.ok(retryContext.document)
      assert.equal(retryContext.document.id, doc.id)
      assert.equal(retryContext.document.sourceType, RagSourceTypeEnum.REPOSITORY)
      assert.equal(retryContext.document.targetRevision?.id, idx.revisionId)
      assert.equal(retryContext.document.targetRevision?.id, rev.id)
      assert.deepEqual(retryContext.failedJob.retryPayload.input, initialJob.payload)

      const retryInput: RetryFailedJobAtomicallyInput = {
        projectId: base.projectId,
        failedJobId: failedJobRecord.id,
        expected: {
          knowledgeBaseId: base.id,
          documentId: doc.id,
          documentIndexId: idx.id,
          generation: 1,
          attempts: 4,
          retriedAt: null,
          sourceType: RagSourceTypeEnum.REPOSITORY,
          revisionId: rev.id,
          pipelineHash: idx.pipelineHash,
          membership: { requestedGeneration: 1, activeDocumentIndexId: null },
          activeJobId: null,
        },
        retry: {
          status: RAG_JOB_STATUS.QUEUED,
          attempts: 0,
          payload: initialJob.payload,
          executionState: null,
        },
        now: new Date(),
        idempotencyKey: `retry-${testKey}`,
      }
      const outOfScopeRetry = await repository.retryFailedJobAtomically({
        ...retryInput,
        projectId: `different-project-${testKey}`,
      })

      assert.deepEqual(outOfScopeRetry, { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.NOT_FOUND })
      assert.equal((await failedJobs.findOneByOrFail({ id: failedJobRecord.id })).retriedAt, null)

      await memberships.update({ knowledgeBaseId: base.id, documentId: doc.id }, { requestedGeneration: '2' })
      assert.deepEqual(await repository.retryFailedJobAtomically(retryInput), {
        status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.STALE,
      })
      await memberships.update({ knowledgeBaseId: base.id, documentId: doc.id }, { requestedGeneration: '1' })
      assert.deepEqual(
        await repository.retryFailedJobAtomically({
          ...retryInput,
          expected: { ...retryInput.expected, revisionId: laterRevision.id },
        }),
        { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.STALE },
      )
      assert.deepEqual(
        await repository.retryFailedJobAtomically({
          ...retryInput,
          expected: { ...retryInput.expected, pipelineHash: 'f'.repeat(64) },
        }),
        { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.STALE },
      )
      assert.equal(await jobs.count(), 0)
      assert.equal((await failedJobs.findOneByOrFail({ id: failedJobRecord.id })).retriedAt, null)

      const retryResults = await Promise.all([
        repository.retryFailedJobAtomically(retryInput),
        repository.retryFailedJobAtomically({
          ...retryInput,
          idempotencyKey: `concurrent-retry-${testKey}`,
        }),
      ])
      const retryResult = retryResults.find(
        (result) => result.status === RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.RETRIED,
      )
      assert.equal(
        retryResults.filter((result) => result.status === RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.STALE).length,
        1,
      )
      assert.equal(await jobs.count(), 1)

      if (retryResult?.status !== RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.RETRIED)
        throw new Error('Expected atomic retry to create a job')

      const newJobId = retryResult.jobId
      assert.notEqual(newJobId, initialJob.id)
      assert.notEqual(newJobId, failedJobRecord.id)
      assert.deepEqual(await repository.retryFailedJobAtomically(retryInput), {
        status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.STALE,
      })

      const updatedFailedRecord = await failedJobs.findOneByOrFail({ id: failedJobRecord.id })
      assert.equal(updatedFailedRecord.retriedAt?.getTime(), retryInput.now.getTime())
      assert.equal(updatedFailedRecord.updatedAt.getTime(), retryInput.now.getTime())
      assert.deepEqual(
        { ...updatedFailedRecord },
        {
          ...failedJobRecord,
          retriedAt: updatedFailedRecord.retriedAt,
          updatedAt: updatedFailedRecord.updatedAt,
        },
      )

      // The newly created retry job must be queued with attempts = 0
      const retryJobInDb = await jobs.findOneByOrFail({ id: newJobId })
      assert.equal(retryJobInDb.status, 'queued')
      assert.equal(retryJobInDb.attempts, 0)
      assert.equal(retryJobInDb.retryOfFailedJobId, failedJobRecord.id)
      assert.equal(retryJobInDb.availableAt.getTime(), retryInput.now.getTime())
      assert.equal(retryJobInDb.reservedAt, null)
      assert.equal(retryJobInDb.leaseToken, null)
      assert.equal(retryJobInDb.executionVerification, null)
      assert.ok(typeof retryJobInDb.idempotencyKey === 'string')
      assert.ok([`retry-${testKey}`, `concurrent-retry-${testKey}`].includes(retryJobInDb.idempotencyKey))
      assert.deepEqual(retryJobInDb.payload, initialJob.payload)
      assert.equal(retryJobInDb.executionState?.lastError, undefined)
    } finally {
      await cleanup()
    }
  },
)

test(
  'membership prune and garbage collection lifecycle in isolated schema',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createTestDatabase()
    try {
      const knowledgeBases = dataSource.getRepository(RagKnowledgeBaseModel)
      const documents = dataSource.getRepository(RagDocumentModel)
      const revisions = dataSource.getRepository(RagDocumentRevisionModel)
      const indexes = dataSource.getRepository(RagDocumentIndexModel)
      const memberships = dataSource.getRepository(RagMembershipModel)
      const jobs = dataSource.getRepository(RagJobModel)
      const failedJobs = dataSource.getRepository(RagFailedJobModel)

      const chunkRepository = new TypeOrmRagChunkRepository()
      const relationRepository = new TypeOrmRagDocumentRelationRepository()
      const documentIndexRepository = new TypeOrmRagDocumentIndexRepository(indexes)
      const failedJobRepository = new TypeOrmRagFailedJobRepository(failedJobs)
      const jobRepository = new TypeOrmRagJobRepository(jobs)
      const membershipRepository = new TypeOrmRagMembershipRepository(memberships)
      const kbRepository = new TypeOrmRagKnowledgeBaseRepository(knowledgeBases)
      const docRepository = new TypeOrmRagDocumentRepository(documents)
      const revRepository = new TypeOrmRagDocumentRevisionRepository(revisions)

      const repository = new TypeOrmRagRepository(
        indexes,
        jobRepository,
        membershipRepository,
        documentIndexRepository,
        kbRepository,
        docRepository,
        revRepository,
        failedJobRepository,
        chunkRepository,
        relationRepository,
        new TypeOrmRagJobClaimRepository(jobs),
      )

      const testKey = randomUUID()
      const base = await knowledgeBases.save(
        knowledgeBases.create({ projectId: `prune-${testKey}`, projectName: `prune-test-${testKey}` }),
      )
      const sharedBase = await knowledgeBases.save(
        knowledgeBases.create({ projectId: `shared-${testKey}`, projectName: `shared-test-${testKey}` }),
      )
      const doc1 = await documents.save(
        documents.create({
          sourceType: RagSourceTypeEnum.REPOSITORY,
          sourceKey: `doc1-${testKey}`,
          sourcePath: `docs/doc1-${testKey}.md`,
          unreferencedSince: null,
        }),
      )
      const relationTarget = await documents.save(
        documents.create({
          sourceType: RagSourceTypeEnum.REPOSITORY,
          sourceKey: `target-${testKey}`,
          sourcePath: `docs/target-${testKey}.md`,
          unreferencedSince: null,
        }),
      )
      const rev1 = await revisions.save(
        revisions.create({
          documentId: doc1.id,
          contentSha256: 'e'.repeat(64),
          title: 'Prunable Document',
          content: '# Prunable Document\n\nTo be pruned.',
        }),
      )
      const idx1 = await indexes.save(
        indexes.create({
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
          status: RAG_DOCUMENT_INDEX_STATUS.READY,
          readyAt: new Date(),
          unreferencedSince: null,
        }),
      )
      await memberships.save(
        memberships.create({
          knowledgeBaseId: base.id,
          documentId: doc1.id,
          activeDocumentIndexId: idx1.id,
          requestedGeneration: '1',
          isEntry: true,
          alwaysIncludeFullContent: false,
        }),
      )
      await memberships.save(
        memberships.create({
          knowledgeBaseId: sharedBase.id,
          documentId: doc1.id,
          activeDocumentIndexId: idx1.id,
          requestedGeneration: '1',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
      )
      const chunks = dataSource.getRepository(RagChunkModel)
      const relations = dataSource.getRepository(RagDocumentRelationModel)
      const chunk = await chunks.save(
        chunks.create({
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
      const relation = await relations.save(
        relations.create({
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
      const queuedForPrune = await jobs.save(
        jobs.create({
          knowledgeBaseId: base.id,
          documentId: doc1.id,
          documentIndexId: idx1.id,
          generation: '1',
          status: RAG_JOB_STATUS.QUEUED,
          attempts: 0,
          availableAt: new Date(Date.now() - 1000),
          reservedAt: null,
          idempotencyKey: null,
          retryOfFailedJobId: null,
          payload: {},
          executionState: null,
          executionVerification: null,
        }),
      )
      const retainedFailure = await failedJobs.save(
        failedJobs.create({
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

      const prune = new PruneRagMembershipsUseCase(repository)
      assert.deepEqual(await prune.execute({ projectId: base.projectId, knowledgeBaseId: base.id, documentIds: [] }), {
        pruned: 1,
      })

      assert.equal(await memberships.findOneBy({ knowledgeBaseId: base.id, documentId: doc1.id }), null)
      assert.equal(await jobs.findOneBy({ id: queuedForPrune.id }), null)
      assert.ok(await failedJobs.findOneBy({ id: retainedFailure.id }))
      assert.equal((await indexes.findOneByOrFail({ id: idx1.id })).unreferencedSince, null)
      assert.ok(await chunks.findOneBy({ id: chunk.id }))
      assert.ok(await relations.findOneBy({ id: relation.id }))

      assert.deepEqual(
        await prune.execute({ projectId: sharedBase.projectId, knowledgeBaseId: sharedBase.id, documentIds: [] }),
        { pruned: 1 },
      )
      assert.ok((await indexes.findOneByOrFail({ id: idx1.id })).unreferencedSince)
      const expiredAt = new Date(Date.now() - config.gcRetentionMs - 10_000)
      await indexes.update({ id: idx1.id }, { unreferencedSince: expiredAt })
      await revisions.update({ id: rev1.id }, { createdAt: expiredAt })
      const collect = new CollectRagGarbageUseCase(repository, config)

      assert.equal(await collect.execute(), 0, 'a retained failed job protects its index and revision')
      assert.ok(await indexes.findOneBy({ id: idx1.id }))
      assert.ok(await chunks.findOneBy({ id: chunk.id }))
      assert.ok(await relations.findOneBy({ id: relation.id }))

      await failedJobs.update({ id: retainedFailure.id }, { failedAt: expiredAt })
      assert.equal(await collect.execute(), 3, 'expired failure, index, and revision are removed in dependency order')
      assert.equal(await failedJobs.findOneBy({ id: retainedFailure.id }), null)
      assert.equal(await indexes.findOneBy({ id: idx1.id }), null)
      assert.equal(await chunks.findOneBy({ id: chunk.id }), null)
      assert.equal(await relations.findOneBy({ id: relation.id }), null)
      assert.equal(await revisions.findOneBy({ id: rev1.id }), null)
      assert.ok((await documents.findOneByOrFail({ id: doc1.id })).unreferencedSince)
      assert.ok((await documents.findOneByOrFail({ id: relationTarget.id })).unreferencedSince)

      await documents.update({ id: doc1.id }, { unreferencedSince: expiredAt })
      await documents.update({ id: relationTarget.id }, { unreferencedSince: expiredAt })
      assert.equal(await collect.execute(), 2)
      assert.equal(await documents.findOneBy({ id: doc1.id }), null)
      assert.equal(await documents.findOneBy({ id: relationTarget.id }), null)
    } finally {
      await cleanup()
    }
  },
)
