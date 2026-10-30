import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { CollectDocumentIndexGarbageCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/collect-document-index-garbage.command.handler.ts'
import { CollectIndexChunkGarbageCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/collect-index-chunk-garbage.command.handler.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/DocumentIndexes/Application/Helpers/document-index-execution-lifecycle.helper.ts'
import { InspectDocumentIndexRetentionQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/inspect-document-index-retention.query.handler.ts'
import { PlanDocumentIndexGarbageQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/plan-document-index-garbage.query.handler.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { DocumentIndexModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index.model.ts'
import { FailedJobModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/failed-job.model.ts'
import { JobModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/job.model.ts'
import { ChunkRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/chunk.repository.ts'
import { DocumentIndexRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/document-index.repository.ts'
import { FailedJobRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/job.repository.ts'
import { CollectDocumentRelationGarbageCommandHandler } from '../../../src/Documents/Application/Commands/collect-document-relation-garbage.command.handler.ts'
import { CollectDocumentRevisionGarbageCommandHandler } from '../../../src/Documents/Application/Commands/collect-document-revision-garbage.command.handler.ts'
import { LockDocumentRetentionParentsCommandHandler } from '../../../src/Documents/Application/Commands/lock-document-retention-parents.command.handler.ts'
import { DocumentGarbageCollectionRequestedEvent } from '../../../src/Documents/Application/Events/document-garbage-collection-requested.event.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../src/Documents/Application/Listeners/document-garbage-collection-requested.listener.ts'
import { InspectDocumentRelationRetentionQueryHandler } from '../../../src/Documents/Application/Queries/inspect-document-relation-retention.query.handler.ts'
import { InspectDocumentRetentionQueryHandler } from '../../../src/Documents/Application/Queries/inspect-document-retention.query.handler.ts'
import { InspectDocumentRevisionRetentionQueryHandler } from '../../../src/Documents/Application/Queries/inspect-document-revision-retention.query.handler.ts'
import { PlanDocumentRelationGarbageQueryHandler } from '../../../src/Documents/Application/Queries/plan-document-relation-garbage.query.handler.ts'
import { PlanDocumentRevisionGarbageQueryHandler } from '../../../src/Documents/Application/Queries/plan-document-revision-garbage.query.handler.ts'
import { DocumentSourceTypeEnum } from '../../../src/Documents/Domain/Enums/document-source-type.enum.ts'
import { DocumentRevisionModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document.model.ts'
import { DocumentRelationRepository } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Repositories/document-relation.repository.ts'
import { DocumentRevisionRepository } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Repositories/document-revision.repository.ts'
import { DocumentRepository } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Repositories/document.repository.ts'
import { InspectKnowledgeBaseDocumentRetentionQueryHandler } from '../../../src/KnowledgeBases/Application/Queries/inspect-knowledge-base-document-retention.query.handler.ts'
import { KnowledgeBaseDocumentModel } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base.model.ts'
import { KnowledgeBaseDocumentRepository } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base-document.repository.ts'
import { KnowledgeBaseRepository } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base.repository.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { DocumentIndexPersistenceFixture } from '../../Support/document-index-persistence.fixture.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

test(
  'expired failed jobs are collected only when no retry job references them',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)

    try {
      const knowledgeBaseModelRepository = dataSource.getRepository(KnowledgeBaseModel)
      const documentModelRepository = dataSource.getRepository(DocumentModel)
      const documentRevisionModelRepository = dataSource.getRepository(DocumentRevisionModel)
      const documentIndexModelRepository = dataSource.getRepository(DocumentIndexModel)
      const failedJobModelRepository = dataSource.getRepository(FailedJobModel)
      const jobModelRepository = dataSource.getRepository(JobModel)
      const knowledgeBaseDocumentModelRepository = dataSource.getRepository(KnowledgeBaseDocumentModel)
      const key = randomUUID()
      const base = await knowledgeBaseModelRepository.save(
        knowledgeBaseModelRepository.create({ projectId: `failed-gc-project-${key}`, projectName: `failed-gc-${key}` }),
      )
      const retryBase = await knowledgeBaseModelRepository.save(
        knowledgeBaseModelRepository.create({
          projectId: `failed-gc-retry-project-${key}`,
          projectName: `failed-gc-retry-${key}`,
        }),
      )
      const document = await documentModelRepository.save(
        documentModelRepository.create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
          sourceKey: key,
          sourcePath: `docs/${key}.md`,
          unreferencedSince: null,
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
      await knowledgeBaseDocumentModelRepository.save(
        knowledgeBaseDocumentModelRepository.create({
          knowledgeBaseId: retryBase.id,
          documentId: document.id,
          activeDocumentIndexId: null,
          requestedGeneration: '1',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
      )
      const revision = await documentRevisionModelRepository.save(
        documentRevisionModelRepository.create({
          documentId: document.id,
          contentSha256: 'a'.repeat(64),
          title: 'GC',
          content: '# GC',
        }),
      )
      const index = await documentIndexModelRepository.save(
        documentIndexModelRepository.create({
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
          status: DocumentIndexStatusEnum.READY,
          readyAt: new Date(),
          unreferencedSince: null,
        }),
      )
      const old = new Date('2020-01-01T00:00:00.000Z')
      const recent = new Date('2025-01-01T00:00:00.000Z')
      const createFailure = (failedAt: Date, knowledgeBaseId = base.id) =>
        failedJobModelRepository.save(
          failedJobModelRepository.create({
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
      await jobModelRepository.save(
        jobModelRepository.create({
          knowledgeBaseId: base.id,
          documentId: document.id,
          documentIndexId: index.id,
          generation: '1',
          status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
          attempts: 0,
          availableAt: new Date(),
          reservedAt: null,
          leaseToken: null,
          idempotencyKey: null,
          retryOfFailedJobId: referenced.id,
          payload: {},
          executionState: null,
          executionVerification: null,
          leaseExpiresAt: null,
        }),
      )

      const failedJobRepository = new FailedJobRepository(persistenceTransaction)
      const jobRepository = new JobRepository(persistenceTransaction)
      const retentionMs = 2 * 365 * 24 * 60 * 60 * 1000
      const nearCutoff = await createFailure(new Date(Date.now() - retentionMs))
      const documentRepository = new DocumentRepository(persistenceTransaction)
      const documentIndexPersistenceFixture = new DocumentIndexPersistenceFixture(
        persistenceTransaction,
        jobRepository,
        new KnowledgeBaseDocumentRepository(persistenceTransaction),
        new DocumentIndexRepository(persistenceTransaction),
        new KnowledgeBaseRepository(persistenceTransaction),
        documentRepository,
        new DocumentRevisionRepository(persistenceTransaction),
        failedJobRepository,
        new ChunkRepository(persistenceTransaction, retrievalDataSource),
        new DocumentRelationRepository(persistenceTransaction),
      )
      const collectGarbage = new DocumentGarbageCollectionRequestedListener(
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
        { gcRetentionMs: retentionMs },
        documentIndexPersistenceFixture.jobRepository,
        documentIndexPersistenceFixture.failedJobRepository,
      )
      const failureCountBeforeCollection = await failedJobModelRepository.count()
      const deleted = await collectGarbage.handle(new DocumentGarbageCollectionRequestedEvent())

      assert.equal(deleted, undefined)
      assert.equal(await failedJobModelRepository.count(), failureCountBeforeCollection - 2)
      assert.equal(await failedJobModelRepository.findOneBy({ id: expired.id }), null)
      assert.equal(await failedJobModelRepository.findOneBy({ id: nearCutoff.id }), null)
      assert.ok(await failedJobModelRepository.findOneBy({ id: referenced.id }))
      assert.ok(await failedJobModelRepository.findOneBy({ id: fresh.id }))

      const retryWins = await createFailure(old, retryBase.id)
      const retryRunner = dataSource.createQueryRunner()
      await retryRunner.connect()
      await retryRunner.startTransaction()
      try {
        assert.ok(
          await persistenceTransaction.bind(retryRunner.manager, () =>
            failedJobRepository.lockFailure({ failedJobId: retryWins.id }),
          ),
        )
        const skippedLockedFailure = await dataSource.transaction((manager) =>
          persistenceTransaction.bind(manager, () =>
            failedJobRepository.lockExpiredFailure({ failedJobId: retryWins.id }),
          ),
        )
        assert.equal(skippedLockedFailure, null, 'retention skips a failure already locked by retry')

        await retryRunner.manager.getRepository(JobModel).save(
          jobModelRepository.create({
            knowledgeBaseId: retryBase.id,
            documentId: document.id,
            documentIndexId: index.id,
            generation: '2',
            status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
            attempts: 0,
            availableAt: new Date(),
            reservedAt: null,
            leaseToken: null,
            idempotencyKey: null,
            retryOfFailedJobId: retryWins.id,
            payload: {},
            executionState: null,
            executionVerification: null,
            leaseExpiresAt: null,
          }),
        )
        await retryRunner.commitTransaction()
      } catch (error) {
        await retryRunner.rollbackTransaction()
        throw error
      } finally {
        await retryRunner.release()
      }
      const failureCountBeforeRetryCollection = await failedJobModelRepository.count()
      assert.equal(await collectGarbage.handle(new DocumentGarbageCollectionRequestedEvent()), undefined)
      assert.equal(await failedJobModelRepository.count(), failureCountBeforeRetryCollection)
      assert.ok(await failedJobModelRepository.findOneBy({ id: retryWins.id }))

      const retentionWins = await createFailure(old, retryBase.id)
      const retentionRunner = dataSource.createQueryRunner()
      const concurrentRetryRunner = dataSource.createQueryRunner()
      await retentionRunner.connect()
      await concurrentRetryRunner.connect()
      await retentionRunner.startTransaction()
      await concurrentRetryRunner.startTransaction()
      try {
        const locked = await persistenceTransaction.bind(retentionRunner.manager, () =>
          failedJobRepository.lockExpiredFailure({ failedJobId: retentionWins.id }),
        )
        assert.ok(locked)
        assert.equal(
          await persistenceTransaction.bind(retentionRunner.manager, () =>
            jobRepository.countFailureRetries({ failedJobId: retentionWins.id }),
          ),
          0,
        )

        const retryLock = persistenceTransaction.bind(concurrentRetryRunner.manager, () =>
          failedJobRepository.lockFailure({ failedJobId: retentionWins.id }),
        )
        const retryLockState = await Promise.race([
          retryLock.then(() => 'resolved' as const),
          new Promise<'waiting'>((resolve) => setTimeout(() => resolve('waiting'), 25)),
        ])
        assert.equal(retryLockState, 'waiting', 'retry waits while retention holds the failed-job row lock')

        await persistenceTransaction.bind(retentionRunner.manager, () =>
          failedJobRepository.removeExpiredFailure({ failedJobId: retentionWins.id }),
        )
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
