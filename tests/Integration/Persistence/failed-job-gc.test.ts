import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { RagDocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/rag-document-index.model.js'
import { RagDocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/rag-document-revision.model.js'
import { RagDocumentModel } from '../../../src/Infrastructure/Persistence/Models/rag-document.model.js'
import { RagFailedJobModel } from '../../../src/Infrastructure/Persistence/Models/rag-failed-job.model.js'
import { RagJobModel } from '../../../src/Infrastructure/Persistence/Models/rag-job.model.js'
import { RagKnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/rag-knowledge-base.model.js'
import { RagMembershipModel } from '../../../src/Infrastructure/Persistence/Models/rag-membership.model.js'
import { TypeOrmRagFailedJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-failed-job.repository.js'
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
          status: 'ready',
          readyAt: new Date(),
          unreferencedSince: null,
        }),
      )
      const old = new Date('2020-01-01T00:00:00.000Z')
      const recent = new Date('2025-01-01T00:00:00.000Z')
      const createFailure = (failedAt: Date) =>
        failedJobs.save(
          failedJobs.create({
            jobId: randomUUID(),
            knowledgeBaseId: base.id,
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
          status: 'queued',
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
      const deleted = await dataSource.transaction((manager) =>
        repository.deleteExpiredUnreferenced(manager, new Date('2022-01-01T00:00:00.000Z')),
      )

      assert.equal(deleted, 1)
      assert.equal(await failedJobs.findOneBy({ id: expired.id }), null)
      assert.ok(await failedJobs.findOneBy({ id: referenced.id }))
      assert.ok(await failedJobs.findOneBy({ id: fresh.id }))
    } finally {
      await cleanup()
    }
  },
)
