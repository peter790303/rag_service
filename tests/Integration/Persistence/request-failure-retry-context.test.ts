import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { RagConfig } from '../../../config/rag.config.js'
import { RagIndexRequestAssembler } from '../../../src/Application/KnowledgeBases/Assemblers/rag-index-request.assembler.js'
import { ClaimNextRagJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/claim-next-rag-job.use-case.js'
import { FailRagIndexJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/fail-rag-index-job.use-case.js'
import { RequestRagIndexUseCase } from '../../../src/Application/KnowledgeBases/UseCases/request-rag-index.use-case.js'
import { RetryFailedRagJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retry-failed-rag-job.use-case.js'
import { RagJobTargetStateEnum } from '../../../src/Domain/Knowledge/Enums/rag-job-target-state.enum.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { KnowledgeIndexPendingException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import { RAG_JOB_STATUS } from '../../../src/Domain/Knowledge/rag-job.js'
import { NodeRagCryptographyAdapter } from '../../../src/Infrastructure/External/Cryptography/Adapter/node-rag-cryptography.adapter.js'
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

const createArchivedRequest = async (context: Record<string, unknown>) => {
  const { dataSource, cleanup } = await createTestDatabase()

  try {
    const indexes = dataSource.getRepository(RagDocumentIndexModel)
    const jobs = dataSource.getRepository(RagJobModel)
    const revisions = dataSource.getRepository(RagDocumentRevisionModel)
    const failedJobs = dataSource.getRepository(RagFailedJobModel)
    const repository = new TypeOrmRagRepository(
      indexes,
      new TypeOrmRagJobRepository(jobs),
      new TypeOrmRagMembershipRepository(dataSource.getRepository(RagMembershipModel)),
      new TypeOrmRagDocumentIndexRepository(indexes),
      new TypeOrmRagKnowledgeBaseRepository(dataSource.getRepository(RagKnowledgeBaseModel)),
      new TypeOrmRagDocumentRepository(dataSource.getRepository(RagDocumentModel)),
      new TypeOrmRagDocumentRevisionRepository(revisions),
      new TypeOrmRagFailedJobRepository(failedJobs),
      new TypeOrmRagChunkRepository(),
      new TypeOrmRagDocumentRelationRepository(),
      new TypeOrmRagJobClaimRepository(jobs),
    )
    const pipelineSettings = {
      embeddingModel: config.embeddingModel,
      embeddingDimensions: config.embeddingDimensions,
      chunkingModel: config.chunkingModel,
      chunkingProfile: 'integration-chunks',
      embeddingProfile: 'integration-embeddings',
      lexicalProfile: 'integration-lexical',
      relationProfile: 'integration-relations',
    }
    const assembler = new RagIndexRequestAssembler(pipelineSettings)
    const cryptography = new NodeRagCryptographyAdapter()
    const projectId = `context-project-${randomUUID()}`
    const request = await new RequestRagIndexUseCase(repository, cryptography, pipelineSettings, assembler).execute({
      knowledgeBaseId: randomUUID(),
      projectId,
      projectName: 'Retry context regression',
      sourceType: RagSourceTypeEnum.REPOSITORY,
      sourceKey: randomUUID(),
      sourcePath: 'docs/retry-context.md',
      content: '# Retry context\n\nA persisted request must keep its exact source context.',
      payload: context,
    })
    assert.ok(request.jobId)
    const originalJob = await jobs.findOneByOrFail({ id: request.jobId })
    assert.deepEqual(originalJob.payload, context)
    const claimNext = new ClaimNextRagJobUseCase(repository, cryptography, config.workerLeaseSeconds)
    const failJob = new FailRagIndexJobUseCase(repository)
    await [1, 2, 3, 4].reduce(async (previousFailure, attempt) => {
      await previousFailure
      const claim = await claimNext.execute()
      assert.ok(claim)
      assert.equal(claim.id, originalJob.id)
      assert.equal(claim.attempts, attempt)
      const failedAt = new Date(Date.now() - 60_000)
      await failJob.execute(claim, {
        errorCode: 'CONTEXT_TEST_FAILURE',
        errorMessage: `Attempt ${attempt} failed`,
        failedAt,
        retryAt: attempt < 4 ? failedAt : null,
      })
    }, Promise.resolve())
    assert.equal(await jobs.count(), 0)
    const archive = await failedJobs.findOneByOrFail({ jobId: originalJob.id })
    assert.equal(archive.attempts, 4)
    assert.deepEqual(archive.retryPayload.input, context)

    return {
      cleanup,
      jobs,
      indexes,
      revisions,
      failedJobs,
      originalJob,
      archive,
      projectId,
      retry: new RetryFailedRagJobUseCase(
        repository,
        { modelId: config.embeddingModel, embed: async () => [] },
        cryptography,
        config,
        assembler,
      ),
    }
  } catch (error) {
    await cleanup()

    throw error
  }
}

test(
  'persisted request → terminal archive → manual retry preserves the source context',
  {
    skip: !process.env.RAG_DATABASE_URL,
  },
  async (t) => {
    await [
      { name: 'nonempty context', context: { source: 'repository', metadata: { tags: ['guide'] } } },
      { name: 'context containing a payload property', context: { source: 'repository', payload: 'metadata value' } },
    ].reduce(async (previousCase, { name, context }) => {
      await previousCase
      await t.test(name, async () => {
        const fixture = await createArchivedRequest(context)

        try {
          const result = await fixture.retry.execute(fixture.projectId, fixture.archive.id)
          assert.equal(result.status, RagJobTargetStateEnum.QUEUED)
          assert.equal(typeof result.jobId, 'string')
          assert.ok(result.jobId)
          assert.notEqual(result.jobId, fixture.originalJob.id)
          assert.notEqual(result.jobId, fixture.archive.id)
          const retriedJob = await fixture.jobs.findOneByOrFail({ id: result.jobId })
          assert.deepEqual(retriedJob.payload, context)
          assert.equal(retriedJob.status, RAG_JOB_STATUS.QUEUED)
          assert.equal(retriedJob.attempts, 0)
          assert.equal(retriedJob.documentIndexId, fixture.originalJob.documentIndexId)
          assert.equal(retriedJob.generation, fixture.originalJob.generation)
          assert.equal(retriedJob.retryOfFailedJobId, fixture.archive.id)
          assert.equal(retriedJob.leaseToken, null)
          assert.equal(retriedJob.reservedAt, null)
          assert.equal(retriedJob.executionVerification, null)
          assert.equal(retriedJob.executionState, null)
          const consumedArchive = await fixture.failedJobs.findOneByOrFail({ id: fixture.archive.id })
          assert.ok(consumedArchive.retriedAt)
          assert.deepEqual(consumedArchive.retryPayload, fixture.archive.retryPayload)
          await assert.rejects(
            fixture.retry.execute(fixture.projectId, fixture.archive.id),
            KnowledgeIndexPendingException,
          )
          assert.equal(await fixture.jobs.count(), 1)
        } finally {
          await fixture.cleanup()
        }
      })
    }, Promise.resolve())
  },
)

test(
  'persisted manual retry rejects context drift, source drift and invalid archived input',
  {
    skip: !process.env.RAG_DATABASE_URL,
  },
  async (t) => {
    await ['context drift', 'source drift', 'invalid archived input'].reduce(async (previousCase, name) => {
      await previousCase
      await t.test(name, async () => {
        const fixture = await createArchivedRequest({ source: 'repository', payload: 'metadata value' })

        try {
          if (name === 'source drift') {
            const index = await fixture.indexes.findOneByOrFail({ id: fixture.archive.documentIndexId })
            await fixture.revisions.update(index.revisionId, { content: 'Changed source content' })
          } else {
            await fixture.failedJobs.update(fixture.archive.id, {
              retryPayload: {
                ...fixture.archive.retryPayload,
                input: name === 'context drift' ? { source: 'changed context' } : ['invalid context'],
              },
            })
          }

          await assert.rejects(
            fixture.retry.execute(fixture.projectId, fixture.archive.id),
            KnowledgeIndexPendingException,
          )
          assert.equal(await fixture.jobs.count(), 0)
          assert.equal((await fixture.failedJobs.findOneByOrFail({ id: fixture.archive.id })).retriedAt, null)
        } finally {
          await fixture.cleanup()
        }
      })
    }, Promise.resolve())
  },
)
