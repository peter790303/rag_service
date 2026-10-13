import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { RagConfig } from '../../../config/rag.config.js'
import { EmbeddingProvider } from '../../../src/Application/KnowledgeBases/Contracts/embedding-provider.js'
import { RagExecutionStageEnum } from '../../../src/Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { InvalidRagJobLeaseException } from '../../../src/Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import { MarkdownChunkFactory } from '../../../src/Domain/Knowledge/markdown-chunk.factory.js'
import { RagChunkModel } from '../../../src/Infrastructure/Persistence/Models/rag-chunk.model.js'
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

test('concurrent workers claim a queued job exactly once', { skip: !process.env.RAG_DATABASE_URL }, async () => {
  const { dataSource, cleanup } = await createTestDatabase()
  try {
    const knowledgeBases = dataSource.getRepository(RagKnowledgeBaseModel)
    const documents = dataSource.getRepository(RagDocumentModel)
    const revisions = dataSource.getRepository(RagDocumentRevisionModel)
    const indexes = dataSource.getRepository(RagDocumentIndexModel)
    const memberships = dataSource.getRepository(RagMembershipModel)
    const jobs = dataSource.getRepository(RagJobModel)
    const testKey = randomUUID()
    const base = await knowledgeBases.save(
      knowledgeBases.create({ projectId: `claim-project-${testKey}`, projectName: `claim-test-${testKey}` }),
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
        title: 'claim concurrency',
        content: 'test',
      }),
    )
    const index = await indexes.save(
      indexes.create({
        documentId: document.id,
        revisionId: revision.id,
        pipelineHash: 'b'.repeat(64),
        chunkingModel: 'test',
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
    const unrelatedIndex = await indexes.save(
      indexes.create({
        ...index,
        id: randomUUID(),
        pipelineHash: 'c'.repeat(64),
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
    const job = await jobs.save(
      jobs.create({
        knowledgeBaseId: base.id,
        documentId: document.id,
        documentIndexId: index.id,
        generation: '1',
        status: 'queued',
        attempts: 0,
        availableAt: new Date(Date.now() - 1000),
        reservedAt: null,
        idempotencyKey: null,
        retryOfFailedJobId: null,
        payload: { content: '## Claim concurrency\n\nA document chunk proves the claimed job is indexed.' },
        executionState: null,
        executionVerification: null,
      }),
    )
    const ineligibleKnowledgeBases = await knowledgeBases.save([
      knowledgeBases.create({ projectId: `claim-future-project-${testKey}`, projectName: `claim-future-${testKey}` }),
      knowledgeBases.create({ projectId: `claim-active-project-${testKey}`, projectName: `claim-active-${testKey}` }),
    ])
    await memberships.save(
      ineligibleKnowledgeBases.map((ineligibleKnowledgeBase) =>
        memberships.create({
          knowledgeBaseId: ineligibleKnowledgeBase.id,
          documentId: document.id,
          activeDocumentIndexId: null,
          requestedGeneration: '1',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
      ),
    )
    const ineligibleJobs = await jobs.save([
      jobs.create({
        ...job,
        id: randomUUID(),
        knowledgeBaseId: ineligibleKnowledgeBases[0]!.id,
        status: 'queued',
        attempts: 0,
        availableAt: new Date(Date.now() + 60_000),
        reservedAt: null,
        leaseToken: null,
      }),
      jobs.create({
        ...job,
        id: randomUUID(),
        knowledgeBaseId: ineligibleKnowledgeBases[1]!.id,
        documentIndexId: unrelatedIndex.id,
        status: 'running',
        attempts: 1,
        availableAt: new Date(Date.now() - 1000),
        reservedAt: new Date(),
        leaseToken: randomUUID(),
        executionVerification: {
          claim_token: randomUUID(),
          lease_expires_at: new Date(Date.now() + config.workerLeaseSeconds * 1000).toISOString(),
        },
      }),
    ])

    const createWorker = () => {
      const chunkRepository = new TypeOrmRagChunkRepository()
      const relationRepository = new TypeOrmRagDocumentRelationRepository()
      const documentIndexRepository = new TypeOrmRagDocumentIndexRepository(
        indexes,
        revisions,
        chunkRepository,
        relationRepository,
      )
      const failedJobRepository = new TypeOrmRagFailedJobRepository(dataSource.getRepository(RagFailedJobModel))
      const jobRepository = new TypeOrmRagJobRepository(jobs, memberships, indexes, config, failedJobRepository)
      const membershipRepository = new TypeOrmRagMembershipRepository(memberships, new IntegrationEmbeddingProvider())

      return new TypeOrmRagRepository(
        indexes,
        new IntegrationEmbeddingProvider(),
        config,
        jobRepository,
        membershipRepository,
        documentIndexRepository,
        new TypeOrmRagKnowledgeBaseRepository(knowledgeBases),
        new TypeOrmRagDocumentRepository(documents),
        new TypeOrmRagDocumentRevisionRepository(revisions),
        failedJobRepository,
      )
    }
    const claimed = await Promise.all([createWorker().claimNext(), createWorker().claimNext()])
    assert.equal(claimed.filter(Boolean).length, 1)
    const claimedJob = await jobs.findOneByOrFail({ id: job.id })
    assert.deepEqual(
      claimed.map((claimedWorkerJob) => claimedWorkerJob?.id).filter((jobId) => jobId !== undefined),
      [job.id],
    )
    assert.equal(claimedJob.status, 'running')
    assert.equal(claimedJob.attempts, 1)
    assert.ok(claimedJob.reservedAt)
    assert.match(claimed[0]?.leaseToken ?? '', /^[0-9a-f-]{36}$/)
    assert.equal(claimedJob.executionVerification?.claim_token, claimed[0]?.leaseToken)
    assert.equal(claimedJob.executionVerification?.lease_expires_at, claimed[0]?.leaseExpiresAt.toISOString())
    assert.equal(claimed[0]?.executionVerification.claimToken, claimed[0]?.leaseToken)
    assert.equal(claimed[0]?.executionVerification.leaseExpiresAt, claimed[0]?.leaseExpiresAt.toISOString())
    await createWorker().heartbeat(claimed[0]!, {
      stage: RagExecutionStageEnum.LOADING,
      completedUnits: 1,
      totalUnits: 3,
    })
    const heartbeatJob = await jobs.findOneByOrFail({ id: job.id })
    assert.equal(heartbeatJob.executionVerification?.claim_token, claimed[0]?.leaseToken)
    assert.equal(
      heartbeatJob.executionVerification?.lease_expires_at,
      new Date(heartbeatJob.reservedAt!.getTime() + config.workerLeaseSeconds * 1000).toISOString(),
    )
    const jobStatus = await createWorker().jobStatus(base.projectId, job.id)
    assert.equal(jobStatus.requestedTarget?.executionVerification?.claimToken, claimed[0]?.leaseToken)
    assert.equal(
      jobStatus.requestedTarget?.executionVerification?.leaseExpiresAt,
      heartbeatJob.executionVerification?.lease_expires_at,
    )
    assert.deepEqual(
      await Promise.all(
        ineligibleJobs.map(async (ineligibleJob) => (await jobs.findOneByOrFail({ id: ineligibleJob.id })).status),
      ),
      ['queued', 'running'],
    )

    await jobs.update(ineligibleJobs[0]!.id, { availableAt: new Date(Date.now() - 1000) })
    assert.equal(await createWorker().claimNext(), null, 'a second job must not claim an index being built')
    assert.equal((await jobs.findOneByOrFail({ id: ineligibleJobs[0]!.id })).status, 'queued')
    await jobs.update(ineligibleJobs[0]!.id, { availableAt: new Date(Date.now() + 60_000) })

    claimedJob.reservedAt = new Date(Date.now() - (config.workerLeaseSeconds + 1) * 1000)
    await jobs.save(claimedJob)
    assert.equal(await createWorker().claimNext(), null, 'an expired lease must enter retry backoff')
    const queuedAfterExpiry = await jobs.findOneByOrFail({ id: job.id })
    assert.equal(queuedAfterExpiry.status, 'queued')
    assert.equal(queuedAfterExpiry.attempts, 1)
    assert.equal(queuedAfterExpiry.reservedAt, null)
    assert.equal(queuedAfterExpiry.leaseToken, null)
    assert.equal(queuedAfterExpiry.executionVerification, null)
    assert.equal((queuedAfterExpiry.executionState?.lastError as { code: string }).code, 'INDEXING_LEASE_EXPIRED')
    assert.ok(queuedAfterExpiry.availableAt.getTime() > Date.now())
    await jobs.update(job.id, { availableAt: new Date(Date.now() - 1000) })
    const recovered = await createWorker().claimNext()
    assert.equal(recovered?.id, job.id)
    assert.equal(recovered?.attempts, 2)
    assert.ok(recovered?.leaseToken)
    assert.notEqual(recovered?.leaseToken, claimed[0]?.leaseToken)

    await assert.rejects(createWorker().complete(claimed[0]!), InvalidRagJobLeaseException)
    await assert.rejects(createWorker().fail(claimed[0]!, new Error('stale worker')), InvalidRagJobLeaseException)
    await assert.rejects(
      createWorker().savePlan(claimed[0]!, MarkdownChunkFactory.plan('stale lease must not write'), [[0.1]]),
      InvalidRagJobLeaseException,
    )
    assert.equal(await dataSource.getRepository(RagChunkModel).countBy({ documentIndexId: index.id }), 0)
    assert.ok(await jobs.findOneBy({ id: job.id }), 'stale worker must not remove the active job')
    assert.equal((await indexes.findOneByOrFail({ id: index.id })).status, 'building')

    const plan = MarkdownChunkFactory.plan(
      '## Claim concurrency\n\nA document chunk proves the claimed job is indexed.',
    )
    const vectors = plan.chunks.map((_, ordinal) =>
      Array.from({ length: config.embeddingDimensions }, (_, dimension) => (dimension === ordinal ? 1 : 0)),
    )
    await createWorker().savePlan(recovered!, plan, vectors)
    await createWorker().complete(recovered!)
    await jobs.update(ineligibleJobs[0]!.id, { availableAt: new Date(Date.now() - 1000) })
    assert.equal(await createWorker().claimNext(), null, 'ready shared indexes should activate without rebuilding')
    assert.equal(await jobs.findOneBy({ id: ineligibleJobs[0]!.id }), null)
    assert.equal(await jobs.findOneBy({ id: job.id }), null)
    assert.equal((await indexes.findOneByOrFail({ id: index.id })).status, 'ready')
    assert.equal(
      (await memberships.findOneByOrFail({ knowledgeBaseId: base.id, documentId: document.id })).activeDocumentIndexId,
      index.id,
    )
    const retrievalSnapshot = await createWorker().loadSnapshot({
      projectId: base.projectId,
      queryText: 'claimed document',
      limit: 5,
    })
    assert.equal(retrievalSnapshot.knowledgeBaseId, base.id)
    assert.equal(retrievalSnapshot.chunks.length, 1)
    assert.deepEqual(retrievalSnapshot.lexicalCandidateChunkIds, [retrievalSnapshot.chunks[0]?.id])

    await jobs.update(ineligibleJobs[1]!.id, {
      attempts: 4,
      reservedAt: new Date(Date.now() - (config.workerLeaseSeconds + 1) * 1000),
      executionState: { completedUnits: 2 },
    })
    assert.equal(await createWorker().claimNext(), null)
    assert.equal(await jobs.findOneBy({ id: ineligibleJobs[1]!.id }), null)
    const expiredFailure = await dataSource
      .getRepository(RagFailedJobModel)
      .findOneByOrFail({ jobId: ineligibleJobs[1]!.id })
    assert.equal(expiredFailure.attempts, 4)
    assert.equal(expiredFailure.errorCode, 'INDEXING_LEASE_EXPIRED')
    assert.deepEqual(expiredFailure.retryPayload.executionState, {
      completedUnits: 2,
      lastError: {
        code: 'INDEXING_LEASE_EXPIRED',
        message: 'Indexing worker lease expired after the final attempt',
        failedAt: expiredFailure.failedAt.toISOString(),
      },
    })
  } finally {
    await cleanup()
  }
})
