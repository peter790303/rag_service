import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { QueryFailedError, type EntityManager } from 'typeorm'

import type { ClaimedRagIndexJob } from '../../../src/Application/KnowledgeBases/DataTransferObjects/rag-index-job.dto.js'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/KnowledgeBases/UseCases/replace-index-chunk.use-case.js'
import { RAG_DOCUMENT_INDEX_STATUS } from '../../../src/Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagExecutionStageEnum } from '../../../src/Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { InvalidRagJobLeaseException } from '../../../src/Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import type { MarkdownPlan, PlannedRelation } from '../../../src/Domain/Knowledge/markdown-chunk.factory.js'
import { RAG_JOB_STATUS } from '../../../src/Domain/Knowledge/rag-job.js'
import { PersistenceRagLexicalSearchFormatter } from '../../../src/Infrastructure/Persistence/Formatters/rag-lexical-search.formatter.js'
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

const lexicalFormatter = new PersistenceRagLexicalSearchFormatter()
const replacementPlan: MarkdownPlan = {
  chunks: [{ content: 'New replacement body', headingPath: ['New'], blockStart: 0, blockEnd: 2, tokenCount: 4 }],
  relations: [
    {
      targetReference: 'New.md',
      targetAnchor: null,
      relationType: 'wiki_link',
      evidenceBlockStart: 0,
      evidenceBlockEnd: 1,
      evidenceText: '[[New.md]]',
    },
  ],
}

/** Injects a real PostgreSQL CHECK failure after the replacement rows have been written. */
class ConstraintFailingRelationRepository extends TypeOrmRagDocumentRelationRepository {
  observedReplacement = false

  override async savePlannedIn(
    manager: EntityManager,
    documentIndexId: string,
    relations: readonly PlannedRelation[],
  ): Promise<void> {
    assert.equal(manager.queryRunner?.isTransactionActive, true)
    await super.savePlannedIn(manager, documentIndexId, relations)
    const chunks = await manager.getRepository(RagChunkModel).findBy({ documentIndexId })
    const relationRepository = manager.getRepository(RagDocumentRelationModel)
    const writtenRelations = await relationRepository.findBy({ sourceIndexId: documentIndexId })
    assert.deepEqual(
      chunks.map((chunk) => chunk.content),
      ['New replacement body'],
    )
    assert.deepEqual(
      writtenRelations.map((relation) => relation.targetReference),
      ['New.md'],
    )
    this.observedReplacement = true

    await relationRepository.save(
      relationRepository.create({
        sourceIndexId: documentIndexId,
        targetDocumentId: null,
        targetReference: 'Invalid.md',
        targetAnchor: null,
        relationType: 'wiki_link',
        evidenceBlockStart: -1,
        evidenceBlockEnd: 1,
        evidenceText: 'invalid evidence offset',
      }),
    )
  }
}

test(
  'replacement guards preserve persisted rows and a relation constraint failure rolls back all replacement writes',
  { skip: !process.env.RAG_DATABASE_URL },
  async (t) => {
    const { schema, dataSource, cleanup } = await createTestDatabase()
    try {
      assert.match(schema, /^test_[a-f0-9]+$/)
      assert.ok(dataSource.options.type === 'postgres')
      assert.equal(dataSource.options.schema, schema)
      const knowledgeBases = dataSource.getRepository(RagKnowledgeBaseModel)
      const documents = dataSource.getRepository(RagDocumentModel)
      const revisions = dataSource.getRepository(RagDocumentRevisionModel)
      const indexes = dataSource.getRepository(RagDocumentIndexModel)
      const memberships = dataSource.getRepository(RagMembershipModel)
      const jobs = dataSource.getRepository(RagJobModel)
      const chunks = dataSource.getRepository(RagChunkModel)
      const relations = dataSource.getRepository(RagDocumentRelationModel)
      const testKey = randomUUID()
      const base = await knowledgeBases.save(
        knowledgeBases.create({ projectId: `replacement-${testKey}`, projectName: `replacement-${testKey}` }),
      )
      const document = await documents.save(
        documents.create({
          sourceType: 'repository',
          sourceKey: testKey,
          sourcePath: `${testKey}.md`,
          unreferencedSince: null,
        }),
      )
      const revision = await revisions.save(
        revisions.create({
          documentId: document.id,
          contentSha256: 'a'.repeat(64),
          title: 'replacement rollback',
          content: 'Original persisted body',
        }),
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
          lexicalProfile: lexicalFormatter.format('original').profileVersion,
          relationProfile: 'test',
          status: RAG_DOCUMENT_INDEX_STATUS.BUILDING,
          readyAt: null,
          unreferencedSince: null,
        }),
      )
      const membership = await memberships.save(
        memberships.create({
          knowledgeBaseId: base.id,
          documentId: document.id,
          activeDocumentIndexId: null,
          requestedGeneration: '1',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
      )
      const leaseToken = randomUUID()
      const leaseExpiresAt = new Date(Date.now() + 300_000)
      const verification = { claim_token: leaseToken, lease_expires_at: leaseExpiresAt.toISOString() }
      const jobRecord = await jobs.save(
        jobs.create({
          knowledgeBaseId: base.id,
          documentId: document.id,
          documentIndexId: index.id,
          generation: '1',
          status: RAG_JOB_STATUS.RUNNING,
          attempts: 1,
          availableAt: new Date(),
          reservedAt: new Date(),
          leaseToken,
          idempotencyKey: null,
          retryOfFailedJobId: null,
          payload: {},
          executionState: null,
          executionVerification: verification,
        }),
      )
      const job: ClaimedRagIndexJob = {
        id: jobRecord.id,
        knowledgeBaseId: base.id,
        documentId: document.id,
        documentIndexId: index.id,
        generation: '1',
        attempts: 1,
        leaseToken,
        leaseExpiresAt,
        executionVerification: {
          stage: RagExecutionStageEnum.CLAIMED,
          completedUnits: 0,
          totalUnits: null,
          verifiedAt: null,
        },
      }
      await chunks.save(
        chunks.create({
          documentIndexId: index.id,
          ordinal: 0,
          headingPath: ['Original'],
          content: 'Original persisted body',
          blockStart: 0,
          blockEnd: 2,
          tokenCount: 4,
          embedding: Array.from({ length: 384 }, () => 0.25),
          searchVector: lexicalFormatter.format('original persisted body').searchText,
        }),
      )
      await relations.save(
        relations.create({
          sourceIndexId: index.id,
          targetDocumentId: null,
          targetReference: 'Original.md',
          targetAnchor: 'original-anchor',
          relationType: 'wiki_link',
          evidenceBlockStart: 0,
          evidenceBlockEnd: 1,
          evidenceText: '[[Original.md]]',
        }),
      )
      const originalChunks = await chunks.findBy({ documentIndexId: index.id })
      const originalRelations = await relations.findBy({ sourceIndexId: index.id })
      const assertOriginalRows = async () => {
        assert.deepEqual(await chunks.findBy({ documentIndexId: index.id }), originalChunks)
        assert.deepEqual(await relations.findBy({ sourceIndexId: index.id }), originalRelations)
        assert.equal(await chunks.count(), 1)
        assert.equal(await relations.count(), 1)
      }
      const createUseCase = (relationRepository = new TypeOrmRagDocumentRelationRepository()) =>
        new ReplaceIndexChunkUseCase(
          new TypeOrmRagRepository(
            indexes,
            new TypeOrmRagJobRepository(jobs),
            new TypeOrmRagMembershipRepository(memberships),
            new TypeOrmRagDocumentIndexRepository(indexes),
            new TypeOrmRagKnowledgeBaseRepository(knowledgeBases),
            new TypeOrmRagDocumentRepository(documents),
            new TypeOrmRagDocumentRevisionRepository(revisions),
            new TypeOrmRagFailedJobRepository(dataSource.getRepository(RagFailedJobModel)),
            new TypeOrmRagChunkRepository(),
            relationRepository,
            new TypeOrmRagJobClaimRepository(jobs),
          ),
        )
      const replace = (useCase: ReplaceIndexChunkUseCase, claimedJob = job) =>
        useCase.execute(
          claimedJob,
          replacementPlan,
          [Array.from({ length: 384 }, () => 0.5)],
          [lexicalFormatter.format('new replacement body').searchText],
          new Date(),
        )

      await t.test('wrong claim token leaves old rows intact', async () => {
        await assert.rejects(
          replace(createUseCase(), { ...job, leaseToken: randomUUID() }),
          InvalidRagJobLeaseException,
        )
        await assertOriginalRows()
      })
      await t.test('expired persisted lease leaves old rows intact', async () => {
        await jobs.update(job.id, {
          executionVerification: { ...verification, lease_expires_at: new Date(Date.now() - 1_000).toISOString() },
        })
        await assert.rejects(replace(createUseCase()), InvalidRagJobLeaseException)
        await assertOriginalRows()
        await jobs.update(job.id, { executionVerification: verification })
      })
      await t.test('superseded membership generation leaves old rows intact', async () => {
        await memberships.update(
          { knowledgeBaseId: membership.knowledgeBaseId, documentId: membership.documentId },
          { requestedGeneration: '2' },
        )
        await assert.rejects(replace(createUseCase()), InvalidRagJobLeaseException)
        await assertOriginalRows()
        await memberships.update(
          { knowledgeBaseId: membership.knowledgeBaseId, documentId: membership.documentId },
          { requestedGeneration: '1' },
        )
      })
      await t.test('READY index remains immutable with a valid claim', async () => {
        const readyAt = new Date()
        await indexes.update(index.id, { status: RAG_DOCUMENT_INDEX_STATUS.READY, readyAt })
        await replace(createUseCase())
        await assertOriginalRows()
        const readyIndex = await indexes.findOneByOrFail({ id: index.id })
        assert.equal(readyIndex.status, RAG_DOCUMENT_INDEX_STATUS.READY)
        assert.deepEqual(readyIndex.readyAt, readyAt)
        await indexes.update(index.id, { status: RAG_DOCUMENT_INDEX_STATUS.BUILDING, readyAt: null })
      })
      await t.test('PostgreSQL relation CHECK failure restores old rows and removes partial new rows', async () => {
        const relationRepository = new ConstraintFailingRelationRepository()
        await assert.rejects(replace(createUseCase(relationRepository)), (error: unknown) => {
          assert.ok(error instanceof QueryFailedError)
          assert.equal(error.driverError.code, '23514')

          return true
        })
        assert.equal(relationRepository.observedReplacement, true)
        await assertOriginalRows()
        const persistedIndex = await indexes.findOneByOrFail({ id: index.id })
        assert.equal(persistedIndex.status, RAG_DOCUMENT_INDEX_STATUS.BUILDING)
        assert.equal(persistedIndex.readyAt, null)
      })
    } finally {
      await cleanup()
    }
  },
)
