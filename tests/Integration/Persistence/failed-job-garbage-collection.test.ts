import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { CollectIndexChunkGarbageUseCase } from '../../../src/Application/Chunks/UseCases/collect-index-chunk-garbage.use-case.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { CollectDocumentIndexGarbageUseCase } from '../../../src/Application/DocumentIndexes/UseCases/collect-document-index-garbage.use-case.ts'
import { InspectDocumentIndexRetentionUseCase } from '../../../src/Application/DocumentIndexes/UseCases/inspect-document-index-retention.use-case.ts'
import { PlanDocumentIndexGarbageUseCase } from '../../../src/Application/DocumentIndexes/UseCases/plan-document-index-garbage.use-case.ts'
import { CollectDocumentRelationGarbageUseCase } from '../../../src/Application/DocumentRelations/UseCases/collect-document-relation-garbage.use-case.ts'
import { InspectDocumentRelationRetentionUseCase } from '../../../src/Application/DocumentRelations/UseCases/inspect-document-relation-retention.use-case.ts'
import { PlanDocumentRelationGarbageUseCase } from '../../../src/Application/DocumentRelations/UseCases/plan-document-relation-garbage.use-case.ts'
import { CollectDocumentRevisionGarbageUseCase } from '../../../src/Application/DocumentRevisions/UseCases/collect-document-revision-garbage.use-case.ts'
import { InspectDocumentRevisionRetentionUseCase } from '../../../src/Application/DocumentRevisions/UseCases/inspect-document-revision-retention.use-case.ts'
import { PlanDocumentRevisionGarbageUseCase } from '../../../src/Application/DocumentRevisions/UseCases/plan-document-revision-garbage.use-case.ts'
import { DocumentGarbageCollectionRequestedEvent } from '../../../src/Application/Documents/Events/document-garbage-collection-requested.event.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../src/Application/Documents/Listeners/document-garbage-collection-requested.listener.ts'
import { InspectDocumentRetentionUseCase } from '../../../src/Application/Documents/UseCases/inspect-document-retention.use-case.ts'
import { LockDocumentRetentionParentsUseCase } from '../../../src/Application/Documents/UseCases/lock-document-retention-parents.use-case.ts'
import { InspectKnowledgeBaseDocumentRetentionUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/inspect-knowledge-base-document-retention.use-case.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { FailedJobModel } from '../../../src/Infrastructure/Persistence/Models/failed-job.model.ts'
import { JobModel } from '../../../src/Infrastructure/Persistence/Models/job.model.ts'
import { KnowledgeBaseDocumentModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { ChunkRepository } from '../../../src/Infrastructure/Persistence/Repositories/chunk.repository.ts'
import { DocumentIndexRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index.repository.ts'
import { DocumentRelationRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-relation.repository.ts'
import { DocumentRevisionRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-revision.repository.ts'
import { DocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/document.repository.ts'
import { FailedJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../../src/Infrastructure/Persistence/Repositories/job.repository.ts'
import { KnowledgeBaseDocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base-document.repository.ts'
import { KnowledgeBaseRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base.repository.ts'
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
        new PlanDocumentIndexGarbageUseCase(documentIndexPersistenceFixture.documentIndexRepository),
        new CollectDocumentIndexGarbageUseCase(
          documentIndexPersistenceFixture.documentIndexRepository,
          documentIndexPersistenceFixture.jobRepository,
          documentIndexPersistenceFixture.failedJobRepository,
          new InspectKnowledgeBaseDocumentRetentionUseCase(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
          new CollectDocumentRelationGarbageUseCase(documentIndexPersistenceFixture.documentRelationRepository),
          new CollectIndexChunkGarbageUseCase(documentIndexPersistenceFixture.chunkRepository),
        ),
        new PlanDocumentRevisionGarbageUseCase(documentIndexPersistenceFixture.documentRevisionRepository),
        new CollectDocumentRevisionGarbageUseCase(
          documentIndexPersistenceFixture.documentRevisionRepository,
          new InspectDocumentIndexRetentionUseCase(documentIndexPersistenceFixture.documentIndexRepository),
        ),
        new PlanDocumentRelationGarbageUseCase(documentIndexPersistenceFixture.documentRelationRepository),
        new LockDocumentRetentionParentsUseCase(documentIndexPersistenceFixture.documentRepository),
        new InspectDocumentRetentionUseCase(
          new InspectKnowledgeBaseDocumentRetentionUseCase(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
          new InspectDocumentRevisionRetentionUseCase(documentIndexPersistenceFixture.documentRevisionRepository),
          new InspectDocumentIndexRetentionUseCase(documentIndexPersistenceFixture.documentIndexRepository),
          new InspectDocumentRelationRetentionUseCase(documentIndexPersistenceFixture.documentRelationRepository),
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
