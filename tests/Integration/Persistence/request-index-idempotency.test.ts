import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { In } from 'typeorm'

import type { RagConfig } from '../../../config/rag.config.js'
import { EmbeddingProvider } from '../../../src/Application/KnowledgeBases/Contracts/embedding-provider.js'
import { CollectRagGarbageUseCase } from '../../../src/Application/KnowledgeBases/UseCases/collect-rag-garbage.use-case.js'
import { PruneRagMembershipsUseCase } from '../../../src/Application/KnowledgeBases/UseCases/prune-rag-memberships.use-case.js'
import { RequestRagIndexUseCase } from '../../../src/Application/KnowledgeBases/UseCases/request-rag-index.use-case.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { KnowledgeBaseProjectMismatchException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-base-project-mismatch.exception.js'
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

test(
  'requesting an already active ready index reuses it without a new generation or job',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createTestDatabase()
    try {
      const bases = dataSource.getRepository(RagKnowledgeBaseModel)
      const documents = dataSource.getRepository(RagDocumentModel)
      const revisions = dataSource.getRepository(RagDocumentRevisionModel)
      const indexes = dataSource.getRepository(RagDocumentIndexModel)
      const memberships = dataSource.getRepository(RagMembershipModel)
      const jobs = dataSource.getRepository(RagJobModel)
      const chunks = dataSource.getRepository(RagChunkModel)
      const failedJobs = dataSource.getRepository(RagFailedJobModel)
      const fixtureId = randomUUID()
      const projectId = `idempotency-project-${fixtureId}`
      const base = await bases.save(bases.create({ projectId, projectName: `idempotency-test-${fixtureId}` }))
      const knowledgeBaseRepository = new TypeOrmRagKnowledgeBaseRepository(bases)
      const renamedBase = await knowledgeBaseRepository.ensureProject(base.id, projectId, `renamed-${fixtureId}`)
      assert.equal(renamedBase.projectName, `renamed-${fixtureId}`)
      await assert.rejects(
        knowledgeBaseRepository.ensureProject(base.id, `other-project-${fixtureId}`, `other-${fixtureId}`),
        KnowledgeBaseProjectMismatchException,
      )
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
      const repository = new TypeOrmRagRepository(
        indexes,
        new IntegrationEmbeddingProvider(),
        config,
        jobRepository,
        membershipRepository,
        documentIndexRepository,
        knowledgeBaseRepository,
        new TypeOrmRagDocumentRepository(documents),
        new TypeOrmRagDocumentRevisionRepository(revisions),
        failedJobRepository,
      )
      const requestIndex = new RequestRagIndexUseCase(repository)
      const prune = new PruneRagMembershipsUseCase(repository)
      const collectGarbage = new CollectRagGarbageUseCase(repository, config)
      const input = {
        knowledgeBaseId: base.id,
        projectId: base.projectId,
        projectName: renamedBase.projectName,
        sourceType: RagSourceTypeEnum.REPOSITORY,
        sourceKey: fixtureId,
        sourcePath: `${fixtureId}.md`,
        title: 'Idempotency fixture',
        content: '## Stable source\n\nA repeated index request must reuse the active ready index.',
      }
      const first = await requestIndex.execute(input)
      assert.ok(typeof first.jobId === 'string')
      const initialJob = await jobs.findOneByOrFail({ id: first.jobId })
      initialJob.attempts = 2
      initialJob.availableAt = new Date(Date.now() - 1000)
      await jobs.save(initialJob)
      const repeatedQueuedRequest = await requestIndex.execute(input)
      const preservedJob = await jobs.findOneByOrFail({ id: first.jobId })
      assert.equal(repeatedQueuedRequest.jobId, first.jobId)
      assert.equal(repeatedQueuedRequest.generation, first.generation)
      assert.equal(preservedJob.attempts, 2, 'same-target requests must preserve retry attempts')
      assert.equal(
        preservedJob.availableAt.getTime(),
        initialJob.availableAt.getTime(),
        'same-target requests must preserve retry backoff',
      )
      const claim = await repository.claimNext()
      assert.ok(claim)
      assert.equal(claim.id, first.jobId, "the worker must claim this fixture's queued job")
      const plan = MarkdownChunkFactory.plan(input.content)
      const vectors = plan.chunks.map((_, ordinal) =>
        Array.from({ length: config.embeddingDimensions }, (_, dimension) => (dimension === ordinal ? 1 : 0)),
      )
      await repository.savePlan(claim, plan, vectors)
      await repository.complete(claim)

      const document = await documents.findOneByOrFail({ sourceKey: fixtureId })
      const membership = await memberships.findOneByOrFail({ knowledgeBaseId: base.id, documentId: document.id })
      const indexCountBefore = await indexes.countBy({ documentId: document.id })
      const repeated = await requestIndex.execute(input)

      assert.equal(repeated.documentIndexId, membership.activeDocumentIndexId)
      assert.equal(repeated.jobId, null)
      assert.equal(repeated.reusedReadyIndex, true)
      assert.equal(repeated.generation, Number(membership.requestedGeneration))
      assert.equal(await indexes.countBy({ documentId: document.id }), indexCountBefore)
      assert.equal(await jobs.countBy({ knowledgeBaseId: base.id, documentId: document.id }), 0)

      const sharedBases = await Promise.all(
        ['a', 'b'].map((suffix) =>
          bases.save(
            bases.create({
              projectId: `shared-index-project-${suffix}-${fixtureId}`,
              projectName: `shared-index-${suffix}-${fixtureId}`,
            }),
          ),
        ),
      )
      const sharedInput = {
        ...input,
        content: `${input.content}\n\nChanged content for shared-index concurrency.`,
      }
      const sharedRequestResults = await Promise.allSettled(
        sharedBases.map((sharedBase) =>
          requestIndex.execute({
            ...sharedInput,
            knowledgeBaseId: sharedBase.id,
            projectId: sharedBase.projectId,
            projectName: sharedBase.projectName,
          }),
        ),
      )
      const sharedRequests = sharedRequestResults.map((result) => {
        if (result.status === 'rejected') assert.fail(result.reason)

        return result.value
      })
      sharedRequests.forEach((request) => {
        assert.ok(typeof request.jobId === 'string')
      })
      const sharedPlan = MarkdownChunkFactory.plan(sharedInput.content)
      const sharedVectors = sharedPlan.chunks.map((_, ordinal) =>
        Array.from({ length: config.embeddingDimensions }, (_, dimension) => (dimension === ordinal ? 1 : 0)),
      )
      assert.equal(sharedRequests[0]?.documentIndexId, sharedRequests[1]?.documentIndexId)
      const queuedSharedJobs = await jobs.findBy({
        knowledgeBaseId: In(sharedBases.map((sharedBase) => sharedBase.id)),
      })
      assert.equal(queuedSharedJobs.length, 2, 'both knowledge-base memberships must own a queued job')
      const firstSharedClaim = await repository.claimNext()
      assert.ok(firstSharedClaim, 'one of the shared-index jobs must be claimed')
      assert.equal(await repository.claimNext(), null, 'the other job waits for the shared index build')
      await repository.savePlan(firstSharedClaim, sharedPlan, sharedVectors)
      await repository.complete(firstSharedClaim)
      assert.equal(await repository.claimNext(), null, 'the remaining job activates the ready index without rebuilding')
      assert.equal(
        await chunks.countBy({ documentIndexId: String(sharedRequests[0]?.documentIndexId) }),
        sharedPlan.chunks.length,
      )
      const activatedSharedMemberships = await memberships.findBy({
        knowledgeBaseId: In(sharedBases.map((sharedBase) => sharedBase.id)),
        documentId: document.id,
      })
      assert.equal(activatedSharedMemberships.length, 2)
      assert.ok(
        activatedSharedMemberships.every(
          (membership) => membership.activeDocumentIndexId === sharedRequests[0]?.documentIndexId,
        ),
      )

      const readyReuseBase = await bases.save(
        bases.create({
          projectId: `shared-index-reuse-project-${fixtureId}`,
          projectName: `shared-index-reuse-${fixtureId}`,
        }),
      )
      const readyReuseRequest = await requestIndex.execute({
        ...sharedInput,
        knowledgeBaseId: readyReuseBase.id,
        projectId: readyReuseBase.projectId,
        projectName: readyReuseBase.projectName,
      })
      assert.equal(readyReuseRequest.documentIndexId, sharedRequests[0]?.documentIndexId)
      assert.equal(readyReuseRequest.jobId, null)
      assert.equal(readyReuseRequest.reusedReadyIndex, true)
      const readyReuseMembership = await memberships.findOneByOrFail({
        knowledgeBaseId: readyReuseBase.id,
        documentId: document.id,
      })
      assert.equal(readyReuseMembership.activeDocumentIndexId, readyReuseRequest.documentIndexId)
      assert.equal(await jobs.countBy({ knowledgeBaseId: readyReuseBase.id, documentId: document.id }), 0)

      const sharedIndexId = String(sharedRequests[0]?.documentIndexId)
      const sharedIndex = await indexes.findOneByOrFail({ id: sharedIndexId })
      sharedIndex.unreferencedSince = new Date(Date.now() - config.gcRetentionMs - 1000)
      await indexes.save(sharedIndex)
      await prune.execute(sharedBases[0]!.projectId, sharedBases[0]!.id, [])
      assert.equal(await collectGarbage.execute(), 0, 'GC must preserve an index still shared by another membership')
      assert.equal(await chunks.countBy({ documentIndexId: sharedIndexId }), sharedPlan.chunks.length)

      await prune.execute(sharedBases[1]!.projectId, sharedBases[1]!.id, [])
      assert.equal(await collectGarbage.execute(), 0, 'GC must preserve the index reused by a third membership')
      await prune.execute(readyReuseBase.projectId, readyReuseBase.id, [])
      await indexes.update(sharedIndexId, { unreferencedSince: new Date(Date.now() - config.gcRetentionMs - 1000) })
      assert.equal(await collectGarbage.execute(), 1, 'GC must remove the final unreferenced index after retention')
      assert.equal(await indexes.countBy({ id: sharedIndexId }), 0)
      assert.equal(await chunks.countBy({ documentIndexId: sharedIndexId }), 0)

      const sourceRevision = await revisions.findOneByOrFail({ documentId: document.id })
      const orphanIndex = await indexes.save(
        indexes.create({
          documentId: document.id,
          revisionId: sourceRevision.id,
          pipelineHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
          chunkingModel: config.chunkingModel,
          chunkingProfile: 'orphan-gc-fixture',
          embeddingModel: config.embeddingModel,
          embeddingDimensions: config.embeddingDimensions,
          embeddingProfile: 'orphan-gc-fixture',
          lexicalProfile: 'orphan-gc-fixture',
          relationProfile: 'orphan-gc-fixture',
          status: 'ready',
          readyAt: new Date(),
          unreferencedSince: new Date(Date.now() - config.gcRetentionMs - 1000),
        }),
      )
      assert.equal(await collectGarbage.execute(), 1, 'GC must remove a separately orphaned, expired index')
      assert.equal(await indexes.countBy({ id: orphanIndex.id }), 0)

      const concurrentBases = await Promise.all(
        ['a', 'b'].map((suffix) =>
          bases.save(
            bases.create({
              projectId: `new-source-project-${suffix}-${fixtureId}`,
              projectName: `new-source-${suffix}-${fixtureId}`,
            }),
          ),
        ),
      )
      const concurrentSourceKey = `new-source-${fixtureId}`
      const concurrentRequests = await Promise.all(
        concurrentBases.map((concurrentBase) =>
          requestIndex.execute({
            ...input,
            knowledgeBaseId: concurrentBase.id,
            projectId: concurrentBase.projectId,
            projectName: concurrentBase.projectName,
            sourceKey: concurrentSourceKey,
          }),
        ),
      )
      assert.equal(await documents.countBy({ sourceKey: concurrentSourceKey }), 1)
      assert.equal(concurrentRequests[0]?.documentId, concurrentRequests[1]?.documentId)
    } finally {
      await cleanup()
    }
  },
)
