import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { RagConfig } from '../../../config/rag.config.js'
import { EmbeddingProvider } from '../../../src/Application/KnowledgeBases/Contracts/embedding-provider.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { RagDocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/rag-document-index.model.js'
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
import { TypeOrmRagJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-job.repository.js'
import { TypeOrmRagKnowledgeBaseRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-knowledge-base.repository.js'
import { TypeOrmRagMembershipRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-membership.repository.js'
import { TypeOrmRagRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag.repository.js'
import { createTestDatabase } from '../test-database.js'

class IntegrationEmbeddingProvider extends EmbeddingProvider {
  get modelId(): string {
    return 'integration-test-model'
  }

  async embed(): Promise<number[][]> {
    return []
  }
}

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
      const documentIndexRepository = new TypeOrmRagDocumentIndexRepository(
        indexes,
        revisions,
        chunkRepository,
        relationRepository,
      )
      const failedJobRepository = new TypeOrmRagFailedJobRepository(failedJobs)
      const jobRepository = new TypeOrmRagJobRepository(jobs, memberships, indexes, config, failedJobRepository)
      const membershipRepository = new TypeOrmRagMembershipRepository(memberships, new IntegrationEmbeddingProvider())
      const kbRepository = new TypeOrmRagKnowledgeBaseRepository(knowledgeBases)
      const docRepository = new TypeOrmRagDocumentRepository(documents)
      const revRepository = new TypeOrmRagDocumentRevisionRepository(revisions)

      const repository = new TypeOrmRagRepository(
        indexes,
        new IntegrationEmbeddingProvider(),
        config,
        jobRepository,
        membershipRepository,
        documentIndexRepository,
        kbRepository,
        docRepository,
        revRepository,
        failedJobRepository,
      )

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
          status: 'building',
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
          status: 'queued',
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
      const claim1 = await repository.claimNext()
      assert.ok(claim1)
      assert.equal(claim1.id, initialJob.id)
      assert.equal(claim1.attempts, 1)
      await repository.fail(claim1, {
        errorCode: 'API_TIMEOUT',
        errorMessage: 'First attempt timed out',
        retryAt: new Date(Date.now() - 1000),
        terminal: false,
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
      const claim2 = await repository.claimNext()
      assert.ok(claim2)
      assert.equal(claim2.attempts, 2)
      await repository.fail(claim2, {
        errorCode: 'RATE_LIMITED',
        errorMessage: 'Second attempt rate limited',
        retryAt: new Date(Date.now() - 1000),
        terminal: false,
      })
      const jobAfter2 = await jobs.findOneByOrFail({ id: initialJob.id })
      assert.equal(jobAfter2.status, 'queued')
      assert.equal(jobAfter2.attempts, 2)

      // Attempt 3
      const claim3 = await repository.claimNext()
      assert.ok(claim3)
      assert.equal(claim3.attempts, 3)
      await repository.fail(claim3, {
        errorCode: 'SERVICE_UNAVAILABLE',
        errorMessage: 'Third attempt unavailable',
        retryAt: new Date(Date.now() - 1000),
        terminal: false,
      })
      const jobAfter3 = await jobs.findOneByOrFail({ id: initialJob.id })
      assert.equal(jobAfter3.status, 'queued')
      assert.equal(jobAfter3.attempts, 3)

      // Attempt 4 (Final attempt -> Terminal archive)
      const claim4 = await repository.claimNext()
      assert.ok(claim4)
      assert.equal(claim4.attempts, 4)
      await repository.fail(claim4, {
        errorCode: 'FATAL_MODEL_ERROR',
        errorMessage: 'Fourth attempt failed permanently',
        retryAt: null,
        terminal: true,
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

      // Read retry context through repository
      const retryContext = await repository.readRetryContext(base.projectId, failedJobRecord.id)
      assert.ok(retryContext)
      assert.equal(retryContext.failedJob.id, failedJobRecord.id)
      assert.equal(retryContext.knowledgeBase.projectId, base.projectId)
      assert.equal(retryContext.document.id, doc.id)

      const retryInput = {
        projectId: base.projectId,
        failedJobId: failedJobRecord.id,
        expectedKnowledgeBaseId: base.id,
        expectedDocumentId: doc.id,
        expectedDocumentIndexId: idx.id,
        expectedGeneration: 1,
        expectedRevisionId: rev.id,
        expectedPipelineHash: idx.pipelineHash,
        now: new Date(),
        idempotencyKey: `retry-${testKey}`,
      }
      const retryResult = await repository.retryFailedJobAtomically(retryInput)

      assert.equal(retryResult.status, 'retried')

      if (retryResult.status !== 'retried') throw new Error('Expected atomic retry to create a job')

      const newJobId = retryResult.jobId
      assert.deepEqual(await repository.retryFailedJobAtomically(retryInput), { status: 'already-retried' })

      const updatedFailedRecord = await failedJobs.findOneByOrFail({ id: failedJobRecord.id })
      assert.ok(updatedFailedRecord.retriedAt !== null)

      // The newly created retry job must be queued with attempts = 0
      const retryJobInDb = await jobs.findOneByOrFail({ id: newJobId })
      assert.equal(retryJobInDb.status, 'queued')
      assert.equal(retryJobInDb.attempts, 0)
      assert.equal(retryJobInDb.retryOfFailedJobId, failedJobRecord.id)
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
      const documentIndexRepository = new TypeOrmRagDocumentIndexRepository(
        indexes,
        revisions,
        chunkRepository,
        relationRepository,
      )
      const failedJobRepository = new TypeOrmRagFailedJobRepository(failedJobs)
      const jobRepository = new TypeOrmRagJobRepository(jobs, memberships, indexes, config, failedJobRepository)
      const membershipRepository = new TypeOrmRagMembershipRepository(memberships, new IntegrationEmbeddingProvider())
      const kbRepository = new TypeOrmRagKnowledgeBaseRepository(knowledgeBases)
      const docRepository = new TypeOrmRagDocumentRepository(documents)
      const revRepository = new TypeOrmRagDocumentRevisionRepository(revisions)

      const repository = new TypeOrmRagRepository(
        indexes,
        new IntegrationEmbeddingProvider(),
        config,
        jobRepository,
        membershipRepository,
        documentIndexRepository,
        kbRepository,
        docRepository,
        revRepository,
        failedJobRepository,
      )

      const testKey = randomUUID()
      const base = await knowledgeBases.save(
        knowledgeBases.create({ projectId: `prune-${testKey}`, projectName: `prune-test-${testKey}` }),
      )
      const doc1 = await documents.save(
        documents.create({
          sourceType: RagSourceTypeEnum.REPOSITORY,
          sourceKey: `doc1-${testKey}`,
          sourcePath: `docs/doc1-${testKey}.md`,
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
          status: 'ready',
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

      // Execute prune transaction: retain none of doc1
      await repository.withPruneTransaction(async (transaction) => {
        const records = await transaction.findMembershipPruneRecords(base.projectId, base.id, [])
        assert.equal(records.length, 1)
        assert.equal(records[0]?.documentId, doc1.id)

        const cleared = await transaction.clearActiveIndex(records[0]!.membershipId)
        assert.equal(cleared, true)

        const removed = await transaction.removeMembership(records[0]!.membershipId)
        assert.equal(removed, true)

        await transaction.cancelJobsForDocument(base.id, doc1.id)
      })

      // Index 1 must now be marked unreferencedSince
      const updatedIdx = await indexes.findOneByOrFail({ id: idx1.id })
      assert.ok(updatedIdx.unreferencedSince !== null)

      // Membership must be removed
      const membershipAfter = await memberships.findOneBy({ knowledgeBaseId: base.id, documentId: doc1.id })
      assert.equal(membershipAfter, null)
      assert.ok(await failedJobs.findOneBy({ id: retainedFailure.id }))

      // Set unreferencedSince to expired past retention period
      updatedIdx.unreferencedSince = new Date(Date.now() - config.gcRetentionMs - 10000)
      await indexes.save(updatedIdx)

      // Execute garbage collection transaction
      await repository.withGarbageCollectionTransaction(async (gc) => {
        const candidates = await gc.findGarbageIndexCandidates()
        const targetCandidate = candidates.find((c) => c.documentIndexId === idx1.id)
        assert.ok(targetCandidate)
        assert.equal(targetCandidate.membershipCount, 0)
        assert.equal(targetCandidate.jobCount, 0)
        assert.equal(targetCandidate.failedJobCount, 1)
        assert.equal(targetCandidate.activeLeaseCount, 0)

        const deleted = await gc.deleteIfUnreferenced(idx1.id, new Date(Date.now() - config.gcRetentionMs))
        assert.equal(deleted, false)
      })

      assert.ok(await indexes.findOneBy({ id: idx1.id }))

      await repository.withGarbageCollectionTransaction(async (gc) => {
        assert.equal(await gc.deleteExpiredUnreferencedFailedJobs(new Date(Date.now() - config.gcRetentionMs)), 0)
        const deletedFailures = await gc.deleteExpiredUnreferencedFailedJobs(
          new Date(Date.now() + config.gcRetentionMs),
        )
        assert.equal(deletedFailures, 1)
        const deleted = await gc.deleteIfUnreferenced(idx1.id, new Date(Date.now() - config.gcRetentionMs))
        assert.equal(deleted, true)
      })

      // Index must now be deleted
      assert.equal(await indexes.findOneBy({ id: idx1.id }), null)
    } finally {
      await cleanup()
    }
  },
)
