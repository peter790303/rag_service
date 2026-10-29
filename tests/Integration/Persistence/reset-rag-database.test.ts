import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { FailedJobModel } from '../../../src/Infrastructure/Persistence/Models/failed-job.model.ts'
import { JobModel } from '../../../src/Infrastructure/Persistence/Models/job.model.ts'
import { KnowledgeBaseDocumentModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'
import {
  resetRagDatabase,
  type ImportManifestEntry,
} from '../../../src/Infrastructure/Persistence/reset-rag-database.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

test(
  'RAG reset deletes indexed source records while preserving schema migrations and unrelated tables',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { schema, dataSource, cleanup } = await createPersistenceTestDatabase()

    try {
      const knowledgeBaseRepository = dataSource.getRepository(KnowledgeBaseModel)
      const knowledgeBases = await knowledgeBaseRepository.save([
        knowledgeBaseRepository.create({ projectId: 'reset-test', projectName: 'Reset test' }),
        knowledgeBaseRepository.create({ projectId: 'reset-test-secondary', projectName: 'Reset test secondary' }),
      ])
      const [primaryKnowledgeBase, secondaryKnowledgeBase] = knowledgeBases
      assert.ok(primaryKnowledgeBase)
      assert.ok(secondaryKnowledgeBase)
      const document = await dataSource.getRepository(DocumentModel).save(
        dataSource.getRepository(DocumentModel).create({
          sourceType: DocumentSourceTypeEnum.OBSIDIAN,
          sourceKey: 'reset-test-vault',
          sourcePath: 'test.md',
          currentTitle: 'Test',
          unreferencedSince: null,
        }),
      )
      await dataSource.getRepository(KnowledgeBaseDocumentModel).save(
        knowledgeBases.map((knowledgeBase, index) =>
          dataSource.getRepository(KnowledgeBaseDocumentModel).create({
            knowledgeBaseId: knowledgeBase.id,
            documentId: document.id,
            activeDocumentIndexId: null,
            requestedGeneration: '0',
            isEntry: index === 0,
            alwaysIncludeFullContent: index === 1,
          }),
        ),
      )
      const revision = await dataSource.getRepository(DocumentRevisionModel).save(
        dataSource.getRepository(DocumentRevisionModel).create({
          documentId: document.id,
          contentSha256: 'c'.repeat(64),
          title: 'Test',
          content: 'Fixture for an active index',
        }),
      )
      const activeIndex = await dataSource.getRepository(DocumentIndexModel).save(
        dataSource.getRepository(DocumentIndexModel).create({
          documentId: document.id,
          revisionId: revision.id,
          pipelineHash: 'd'.repeat(64),
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
      await dataSource
        .getRepository(KnowledgeBaseDocumentModel)
        .update(
          { knowledgeBaseId: primaryKnowledgeBase.id, documentId: document.id },
          { activeDocumentIndexId: activeIndex.id },
        )
      const failedJob = await dataSource.getRepository(FailedJobModel).save(
        dataSource.getRepository(FailedJobModel).create({
          jobId: randomUUID(),
          knowledgeBaseId: primaryKnowledgeBase.id,
          documentId: document.id,
          documentIndexId: activeIndex.id,
          generation: '1',
          attempts: 4,
          errorCode: null,
          errorMessage: null,
          blockedReasons: [],
          retryPayload: {},
          failedAt: new Date(),
          retriedAt: null,
        }),
      )
      await dataSource.getRepository(JobModel).save(
        dataSource.getRepository(JobModel).create({
          knowledgeBaseId: primaryKnowledgeBase.id,
          documentId: document.id,
          documentIndexId: activeIndex.id,
          generation: '1',
          status: 'queued',
          attempts: 0,
          availableAt: new Date(),
          reservedAt: null,
          leaseToken: null,
          leaseExpiresAt: null,
          idempotencyKey: null,
          retryOfFailedJobId: failedJob.id,
          payload: {},
          executionState: null,
          executionVerification: null,
        }),
      )
      await dataSource.query(`CREATE TABLE "${schema}"."unrelated_test_data" (id integer PRIMARY KEY)`)
      await dataSource.query(`INSERT INTO "${schema}"."unrelated_test_data" (id) VALUES (1)`)

      const queryRunner = dataSource.createQueryRunner()
      try {
        let manifest: ImportManifestEntry[] = []
        const count = await resetRagDatabase(queryRunner, async (entries) => {
          manifest = entries
        })
        assert.equal(count, 2)
        assert.deepEqual(
          manifest.map((entry) => ({
            projectId: entry.projectId,
            knowledgeBaseId: entry.knowledgeBaseId,
            sourcePath: entry.sourcePath,
            title: entry.title,
            isEntry: entry.isEntry,
            alwaysIncludeFullContent: entry.alwaysIncludeFullContent,
          })),
          [
            {
              projectId: 'reset-test',
              knowledgeBaseId: primaryKnowledgeBase.id,
              sourcePath: 'test.md',
              title: 'Test',
              isEntry: true,
              alwaysIncludeFullContent: false,
            },
            {
              projectId: 'reset-test-secondary',
              knowledgeBaseId: secondaryKnowledgeBase.id,
              sourcePath: 'test.md',
              title: 'Test',
              isEntry: false,
              alwaysIncludeFullContent: true,
            },
          ],
        )
      } finally {
        await queryRunner.release()
      }

      assert.equal(await dataSource.getRepository(KnowledgeBaseModel).count(), 0)
      assert.equal(await dataSource.getRepository(DocumentModel).count(), 0)
      assert.equal(await dataSource.getRepository(KnowledgeBaseDocumentModel).count(), 0)
      assert.equal(await dataSource.getRepository(DocumentIndexModel).count(), 0)
      assert.equal(await dataSource.getRepository(DocumentRevisionModel).count(), 0)
      assert.equal(await dataSource.getRepository(JobModel).count(), 0)
      assert.equal(await dataSource.getRepository(FailedJobModel).count(), 0)
      assert.equal((await dataSource.query(`SELECT id FROM "${schema}"."unrelated_test_data"`)).length, 1)
      assert.equal(await dataSource.showMigrations(), false)

      const otherKnowledgeBase = await knowledgeBaseRepository.save(
        knowledgeBaseRepository.create({ projectId: 'other-source', projectName: 'Other source' }),
      )
      const otherDocument = await dataSource.getRepository(DocumentModel).save(
        dataSource.getRepository(DocumentModel).create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
          sourceKey: 'other-source',
          sourcePath: 'other.txt',
          currentTitle: 'Other source document',
          unreferencedSince: null,
        }),
      )
      await dataSource.getRepository(KnowledgeBaseDocumentModel).save(
        dataSource.getRepository(KnowledgeBaseDocumentModel).create({
          knowledgeBaseId: otherKnowledgeBase.id,
          documentId: otherDocument.id,
          activeDocumentIndexId: null,
          requestedGeneration: '0',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
      )
      const emptyResetRunner = dataSource.createQueryRunner()
      try {
        let manifestWriterCalled = false
        const secondResetCount = await resetRagDatabase(emptyResetRunner, async () => {
          manifestWriterCalled = true
        })
        assert.equal(secondResetCount, 0)
        assert.equal(manifestWriterCalled, false)
      } finally {
        await emptyResetRunner.release()
      }
      assert.equal(await knowledgeBaseRepository.count(), 0)
      assert.equal(await dataSource.getRepository(DocumentModel).count(), 0)
    } finally {
      await cleanup()
    }
  },
)

test(
  'RAG reset aborts without deleting data when a queued job becomes running during the manifest snapshot',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createPersistenceTestDatabase()

    try {
      const knowledgeBase = await dataSource
        .getRepository(KnowledgeBaseModel)
        .save(
          dataSource.getRepository(KnowledgeBaseModel).create({ projectId: 'reset-race', projectName: 'Reset race' }),
        )
      const document = await dataSource.getRepository(DocumentModel).save(
        dataSource.getRepository(DocumentModel).create({
          sourceType: DocumentSourceTypeEnum.OBSIDIAN,
          sourceKey: 'reset-race-vault',
          sourcePath: 'race.md',
          currentTitle: 'Race',
          unreferencedSince: null,
        }),
      )
      await dataSource.getRepository(KnowledgeBaseDocumentModel).save(
        dataSource.getRepository(KnowledgeBaseDocumentModel).create({
          knowledgeBaseId: knowledgeBase.id,
          documentId: document.id,
          activeDocumentIndexId: null,
          requestedGeneration: '0',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
      )
      const revision = await dataSource.getRepository(DocumentRevisionModel).save(
        dataSource.getRepository(DocumentRevisionModel).create({
          documentId: document.id,
          contentSha256: 'a'.repeat(64),
          title: 'Race',
          content: 'Fixture',
        }),
      )
      const index = await dataSource.getRepository(DocumentIndexModel).save(
        dataSource.getRepository(DocumentIndexModel).create({
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
          status: DocumentIndexStatusEnum.BUILDING,
          readyAt: null,
          unreferencedSince: null,
        }),
      )
      const job = await dataSource.getRepository(JobModel).save(
        dataSource.getRepository(JobModel).create({
          knowledgeBaseId: knowledgeBase.id,
          documentId: document.id,
          documentIndexId: index.id,
          generation: '1',
          status: 'queued',
          attempts: 0,
          reservedAt: null,
          leaseToken: null,
          leaseExpiresAt: null,
          idempotencyKey: null,
          retryOfFailedJobId: null,
          payload: {},
          executionState: null,
          executionVerification: null,
        }),
      )

      const resetRunner = dataSource.createQueryRunner()
      const workerRunner = dataSource.createQueryRunner()
      try {
        await workerRunner.connect()
        await assert.rejects(
          resetRagDatabase(resetRunner, async () => {
            await workerRunner.manager.getRepository(JobModel).update(job.id, {
              status: 'running',
              attempts: 1,
              reservedAt: new Date(),
              leaseToken: randomUUID(),
              executionVerification: {
                claim_token: randomUUID(),
                lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
              },
            })
          }),
          /serializ|concurrent/i,
        )
      } finally {
        await Promise.all([resetRunner.release(), workerRunner.release()])
      }

      assert.equal(await dataSource.getRepository(KnowledgeBaseModel).count(), 1)
      assert.equal(await dataSource.getRepository(DocumentModel).count(), 1)
      assert.equal(await dataSource.getRepository(KnowledgeBaseDocumentModel).count(), 1)
      assert.equal(
        await dataSource
          .getRepository(JobModel)
          .findOneByOrFail({ id: job.id })
          .then(({ status }) => status),
        'running',
      )
    } finally {
      await cleanup()
    }
  },
)
