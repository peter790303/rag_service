import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { In } from 'typeorm'

import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { JobModel } from '../../../src/Infrastructure/Persistence/Models/job.model.ts'
import { KnowledgeBaseDocumentModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { JobRepository } from '../../../src/Infrastructure/Persistence/Repositories/job.repository.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

test(
  'fresh jobs schema supports indexed lease expiry, exact-boundary recovery and unavailable expiry',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { schema, dataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)

    try {
      const knowledgeBaseModelRepository = dataSource.getRepository(KnowledgeBaseModel)
      const documentModelRepository = dataSource.getRepository(DocumentModel)
      const documentRevisionModelRepository = dataSource.getRepository(DocumentRevisionModel)
      const documentIndexModelRepository = dataSource.getRepository(DocumentIndexModel)
      const knowledgeBaseDocumentModelRepository = dataSource.getRepository(KnowledgeBaseDocumentModel)
      const jobModelRepository = dataSource.getRepository(JobModel)
      const key = randomUUID()
      const bases = await knowledgeBaseModelRepository.save(
        knowledgeBaseModelRepository.create(
          Array.from({ length: 254 }, (_, position) => ({
            projectId: `lease-migration-${key}-${position}`,
            projectName: `lease-migration-${position}`,
          })),
        ),
      )
      const document = await documentModelRepository.save(
        documentModelRepository.create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
          sourceKey: key,
          sourcePath: `lease-migration/${key}.md`,
          unreferencedSince: null,
        }),
      )
      const revision = await documentRevisionModelRepository.save(
        documentRevisionModelRepository.create({
          documentId: document.id,
          contentSha256: 'a'.repeat(64),
          title: 'Lease',
          content: 'Lease',
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
          status: DocumentIndexStatusEnum.BUILDING,
          readyAt: null,
          unreferencedSince: null,
        }),
      )
      await knowledgeBaseDocumentModelRepository.save(
        knowledgeBaseDocumentModelRepository.create(
          bases.map((base) => ({
            knowledgeBaseId: base.id,
            documentId: document.id,
            activeDocumentIndexId: null,
            requestedGeneration: '1',
            isEntry: false,
            alwaysIncludeFullContent: false,
          })),
        ),
      )
      const records = await jobModelRepository.save(
        jobModelRepository.create(
          bases.map((base) => ({
            knowledgeBaseId: base.id,
            documentId: document.id,
            documentIndexId: index.id,
            generation: '1',
            status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
            attempts: 0,
            availableAt: new Date('2026-10-14T00:00:00.000Z'),
            reservedAt: null,
            leaseToken: null,
            leaseExpiresAt: null,
            idempotencyKey: null,
            retryOfFailedJobId: null,
            payload: {},
            executionState: null,
            executionVerification: null,
          })),
        ),
      )

      const validRecords = records.slice(0, 251)
      const missingExpiryRecord = records[251]!
      const invalidExpiryRecord = records[252]!
      const queuedRecord = records[253]!
      const leaseToken = randomUUID()
      const leaseExpiresAt = '2026-10-14T08:05:00.000+08:00'
      const runningLease = {
        status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
        attempts: 1,
        reservedAt: new Date('2026-10-14T00:00:00.000Z'),
        leaseToken,
      }
      const verification = { claim_token: leaseToken, lease_expires_at: leaseExpiresAt }

      await jobModelRepository.update(
        { id: In(validRecords.map((record) => record.id)) },
        { ...runningLease, leaseExpiresAt: new Date(leaseExpiresAt), executionVerification: verification },
      )
      await jobModelRepository.update(missingExpiryRecord.id, {
        ...runningLease,
        executionVerification: { claim_token: leaseToken, lease_expires_at: '' },
      })
      await jobModelRepository.update(invalidExpiryRecord.id, {
        ...runningLease,
        executionVerification: { claim_token: leaseToken, lease_expires_at: 'invalid' },
      })

      const persisted = await jobModelRepository.findBy({ id: In(validRecords.map((record) => record.id)) })
      assert.equal(persisted.length, 251)
      assert.ok(persisted.every((record) => record.leaseExpiresAt?.getTime() === new Date(leaseExpiresAt).getTime()))
      assert.ok(persisted.every((record) => record.executionVerification?.lease_expires_at === leaseExpiresAt))
      const missingExpiry = await jobModelRepository.findOneByOrFail({ id: missingExpiryRecord.id })
      const invalidExpiry = await jobModelRepository.findOneByOrFail({ id: invalidExpiryRecord.id })
      const queued = await jobModelRepository.findOneByOrFail({ id: queuedRecord.id })
      assert.equal(missingExpiry.leaseExpiresAt, null)
      assert.equal(missingExpiry.executionVerification?.lease_expires_at, '')
      assert.equal(invalidExpiry.leaseExpiresAt, null)
      assert.equal(invalidExpiry.executionVerification?.lease_expires_at, 'invalid')
      assert.equal(queued.status, DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED)
      assert.equal(queued.executionVerification, null)
      assert.equal(queued.leaseExpiresAt, null)

      const boundaryAt = new Date(leaseExpiresAt)
      const boundaryRecord = validRecords[0]!
      const futureRecord = validRecords[1]!
      const futureExpiry = new Date(boundaryAt.getTime() + 1000)
      await jobModelRepository.update(futureRecord.id, {
        leaseExpiresAt: futureExpiry,
        executionVerification: { claim_token: leaseToken, lease_expires_at: futureExpiry.toISOString() },
      })
      const executionQueue = new JobRepository(persistenceTransaction)
      const expired = await persistenceTransaction.bind(dataSource.manager, () =>
        executionQueue.findExpiredExecutions({ now: boundaryAt }),
      )
      assert.deepEqual(
        expired.map((record) => record.id).sort(),
        [...validRecords.slice(0, 1), ...validRecords.slice(2), missingExpiryRecord, invalidExpiryRecord]
          .map((record) => record.id)
          .sort(),
        'native expiry selection includes null and exact-boundary running rows and excludes future and queued rows',
      )
      await dataSource.transaction(async (manager) => {
        assert.equal(
          (
            await persistenceTransaction.bind(manager, () =>
              executionQueue.lockExpiredExecution({
                jobId: boundaryRecord.id,
                now: boundaryAt,
              }),
            )
          )?.id,
          boundaryRecord.id,
        )
        assert.equal(
          (
            await persistenceTransaction.bind(manager, () =>
              executionQueue.lockExpiredExecution({
                jobId: missingExpiryRecord.id,
                now: boundaryAt,
              }),
            )
          )?.id,
          missingExpiryRecord.id,
        )
        assert.equal(
          await persistenceTransaction.bind(manager, () =>
            executionQueue.lockExpiredExecution({
              jobId: futureRecord.id,
              now: boundaryAt,
            }),
          ),
          null,
        )
        assert.equal(
          await persistenceTransaction.bind(manager, () =>
            executionQueue.lockExpiredExecution({
              jobId: queuedRecord.id,
              now: boundaryAt,
            }),
          ),
          null,
        )
      })

      const runner = dataSource.createQueryRunner()
      try {
        const table = await runner.getTable(dataSource.driver.buildTableName('jobs', schema))
        const leaseExpiryIndex = table?.indices.find((entry) => entry.name === 'idx_jobs_status_lease_expiry')
        assert.ok(leaseExpiryIndex, 'migration must create the normalized lease-expiry index')
        assert.deepEqual([...leaseExpiryIndex.columnNames].sort(), ['created_at', 'id', 'lease_expires_at', 'status'])

        const indexDefinitions: {
          indexdef: string
        }[] = await runner.query(
          'SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 AND indexname = $3',
          [schema, 'jobs', 'idx_jobs_status_lease_expiry'],
        )
        assert.equal(indexDefinitions.length, 1)
        const indexDefinition = indexDefinitions.at(0)
        assert.ok(indexDefinition)
        assert.match(indexDefinition.indexdef, /\(status, lease_expires_at, created_at, id\)$/)
      } finally {
        await runner.release()
      }
    } finally {
      await cleanup()
    }
  },
)
