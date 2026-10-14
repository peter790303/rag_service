import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { CollectRagGarbageUseCase } from '../../../src/Application/KnowledgeBases/UseCases/collect-rag-garbage.use-case.js'
import { RAG_DOCUMENT_INDEX_STATUS } from '../../../src/Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { RAG_JOB_STATUS } from '../../../src/Domain/Knowledge/rag-job.js'
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
import { TypeOrmRagJobClaimRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-job-claim.repository.js'
import { TypeOrmRagJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-job.repository.js'
import { TypeOrmRagKnowledgeBaseRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-knowledge-base.repository.js'
import { TypeOrmRagMembershipRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-membership.repository.js'
import { TypeOrmRagRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag.repository.js'
import { createTestDatabase } from '../test-database.js'

test(
  'expired failed jobs are collected only when no retry job references them',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createTestDatabase()

    try {
      const knowledgeBases = dataSource.getRepository(RagKnowledgeBaseModel)
      const documents = dataSource.getRepository(RagDocumentModel)
      const revisions = dataSource.getRepository(RagDocumentRevisionModel)
      const indexes = dataSource.getRepository(RagDocumentIndexModel)
      const failedJobs = dataSource.getRepository(RagFailedJobModel)
      const jobs = dataSource.getRepository(RagJobModel)
      const memberships = dataSource.getRepository(RagMembershipModel)
      const key = randomUUID()
      const base = await knowledgeBases.save(
        knowledgeBases.create({ projectId: `failed-gc-project-${key}`, projectName: `failed-gc-${key}` }),
      )
      const retryBase = await knowledgeBases.save(
        knowledgeBases.create({ projectId: `failed-gc-retry-project-${key}`, projectName: `failed-gc-retry-${key}` }),
      )
      const document = await documents.save(
        documents.create({
          sourceType: RagSourceTypeEnum.REPOSITORY,
          sourceKey: key,
          sourcePath: `docs/${key}.md`,
          unreferencedSince: null,
        }),
      )
      await memberships.save(
        memberships.create({
          knowledgeBaseId: base.id,
          documentId: document.id,
          activeDocumentIndexId: null,
          requestedGeneration: '1',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
      )
      await memberships.save(
        memberships.create({
          knowledgeBaseId: retryBase.id,
          documentId: document.id,
          activeDocumentIndexId: null,
          requestedGeneration: '1',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
      )
      const revision = await revisions.save(
        revisions.create({ documentId: document.id, contentSha256: 'a'.repeat(64), title: 'GC', content: '# GC' }),
      )
      const index = await indexes.save(
        indexes.create({
          documentId: document.id,
          revisionId: revision.id,
          pipelineHash: 'b'.repeat(64),
          chunkingModel: 'test',
          chunkingProfile: 'test',
          embeddingModel: 'test',
          embeddingDimensions: 384,
          embeddingProfile: 'test',
          lexicalProfile: 'test',
          relationProfile: 'test',
          status: RAG_DOCUMENT_INDEX_STATUS.READY,
          readyAt: new Date(),
          unreferencedSince: null,
        }),
      )
      const old = new Date('2020-01-01T00:00:00.000Z')
      const recent = new Date('2025-01-01T00:00:00.000Z')
      const createFailure = (failedAt: Date, knowledgeBaseId = base.id) =>
        failedJobs.save(
          failedJobs.create({
            jobId: randomUUID(),
            knowledgeBaseId,
            documentId: document.id,
            documentIndexId: index.id,
            generation: '1',
            attempts: 4,
            errorCode: 'TEST',
            errorMessage: null,
            blockedReasons: [],
            retryPayload: {},
            failedAt,
            retriedAt: null,
          }),
        )

      const expired = await createFailure(old)
      const referenced = await createFailure(old)
      const fresh = await createFailure(recent)
      await jobs.save(
        jobs.create({
          knowledgeBaseId: base.id,
          documentId: document.id,
          documentIndexId: index.id,
          generation: '1',
          status: RAG_JOB_STATUS.QUEUED,
          attempts: 0,
          availableAt: new Date(),
          reservedAt: null,
          leaseToken: null,
          idempotencyKey: null,
          retryOfFailedJobId: referenced.id,
          payload: {},
          executionState: null,
          executionVerification: null,
        }),
      )

      const repository = new TypeOrmRagFailedJobRepository(failedJobs)
      const jobRepository = new TypeOrmRagJobRepository(jobs)
      const retentionMs = 2 * 365 * 24 * 60 * 60 * 1000
      const nearCutoff = await createFailure(new Date(Date.now() - retentionMs))
      const documentRepository = new TypeOrmRagDocumentRepository(documents)
      const store = new TypeOrmRagRepository(
        indexes,
        jobRepository,
        new TypeOrmRagMembershipRepository(memberships),
        new TypeOrmRagDocumentIndexRepository(indexes),
        new TypeOrmRagKnowledgeBaseRepository(knowledgeBases),
        documentRepository,
        new TypeOrmRagDocumentRevisionRepository(revisions),
        repository,
        new TypeOrmRagChunkRepository(),
        new TypeOrmRagDocumentRelationRepository(),
        new TypeOrmRagJobClaimRepository(jobs),
      )
      const collectGarbage = new CollectRagGarbageUseCase(store, { gcRetentionMs: retentionMs })
      const deleted = await collectGarbage.execute()

      assert.equal(deleted, 2)
      assert.equal(await failedJobs.findOneBy({ id: expired.id }), null)
      assert.equal(await failedJobs.findOneBy({ id: nearCutoff.id }), null)
      assert.ok(await failedJobs.findOneBy({ id: referenced.id }))
      assert.ok(await failedJobs.findOneBy({ id: fresh.id }))

      const retryWins = await createFailure(old, retryBase.id)
      const retryRunner = dataSource.createQueryRunner()
      await retryRunner.connect()
      await retryRunner.startTransaction()
      try {
        assert.ok(await repository.lockById(retryRunner.manager, retryWins.id))
        const skippedLockedFailure = await dataSource.transaction((manager) =>
          repository.lockForGarbageCollection(manager, retryWins.id),
        )
        assert.equal(skippedLockedFailure, null, 'retention skips a failure already locked by retry')

        await retryRunner.manager.getRepository(RagJobModel).save(
          jobs.create({
            knowledgeBaseId: retryBase.id,
            documentId: document.id,
            documentIndexId: index.id,
            generation: '2',
            status: RAG_JOB_STATUS.QUEUED,
            attempts: 0,
            availableAt: new Date(),
            reservedAt: null,
            leaseToken: null,
            idempotencyKey: null,
            retryOfFailedJobId: retryWins.id,
            payload: {},
            executionState: null,
            executionVerification: null,
          }),
        )
        await retryRunner.commitTransaction()
      } catch (error) {
        await retryRunner.rollbackTransaction()
        throw error
      } finally {
        await retryRunner.release()
      }
      assert.equal(await collectGarbage.execute(), 0)
      assert.ok(await failedJobs.findOneBy({ id: retryWins.id }))

      const retentionWins = await createFailure(old, retryBase.id)
      const retentionRunner = dataSource.createQueryRunner()
      const concurrentRetryRunner = dataSource.createQueryRunner()
      await retentionRunner.connect()
      await concurrentRetryRunner.connect()
      await retentionRunner.startTransaction()
      await concurrentRetryRunner.startTransaction()
      try {
        const locked = await repository.lockForGarbageCollection(retentionRunner.manager, retentionWins.id)
        assert.ok(locked)
        assert.equal(await jobRepository.countRetriesForFailedJob(retentionRunner.manager, retentionWins.id), 0)

        const retryLock = repository.lockById(concurrentRetryRunner.manager, retentionWins.id)
        const retryLockState = await Promise.race([
          retryLock.then(() => 'resolved' as const),
          new Promise<'waiting'>((resolve) => setTimeout(() => resolve('waiting'), 25)),
        ])
        assert.equal(retryLockState, 'waiting', 'retry waits while retention holds the failed-job row lock')

        await repository.removeForGarbageCollection(retentionRunner.manager, retentionWins.id)
        await retentionRunner.commitTransaction()
        assert.equal(await retryLock, null, 'retry observes that retention removed the row after the lock was released')
        await concurrentRetryRunner.commitTransaction()
      } catch (error) {
        if (retentionRunner.isTransactionActive) await retentionRunner.rollbackTransaction()

        if (concurrentRetryRunner.isTransactionActive) await concurrentRetryRunner.rollbackTransaction()

        throw error
      } finally {
        await retentionRunner.release()
        await concurrentRetryRunner.release()
      }
    } finally {
      await cleanup()
    }
  },
)
