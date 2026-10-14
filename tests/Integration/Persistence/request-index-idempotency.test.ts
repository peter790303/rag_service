import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { In } from 'typeorm'

import type { RagConfig } from '../../../config/rag.config.js'
import { RagIndexRequestAssembler } from '../../../src/Application/KnowledgeBases/Assemblers/rag-index-request.assembler.js'
import { ClaimNextRagJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/claim-next-rag-job.use-case.js'
import { CollectRagGarbageUseCase } from '../../../src/Application/KnowledgeBases/UseCases/collect-rag-garbage.use-case.js'
import { CompleteRagIndexJobUseCase } from '../../../src/Application/KnowledgeBases/UseCases/complete-rag-index-job.use-case.js'
import { PruneRagMembershipsUseCase } from '../../../src/Application/KnowledgeBases/UseCases/prune-rag-memberships.use-case.js'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/KnowledgeBases/UseCases/replace-index-chunk.use-case.js'
import { RequestRagIndexUseCase } from '../../../src/Application/KnowledgeBases/UseCases/request-rag-index.use-case.js'
import { RAG_DOCUMENT_INDEX_STATUS } from '../../../src/Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { InvalidRagJobLeaseException } from '../../../src/Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import { KnowledgeBaseProjectMismatchException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-base-project-mismatch.exception.js'
import { MarkdownChunkFactory } from '../../../src/Domain/Knowledge/markdown-chunk.factory.js'
import { RAG_JOB_STATUS } from '../../../src/Domain/Knowledge/rag-job.js'
import { RagKnowledgeBase } from '../../../src/Domain/Knowledge/rag-knowledge-base.js'
import { NodeRagCryptographyAdapter } from '../../../src/Infrastructure/External/Cryptography/Adapter/node-rag-cryptography.adapter.js'
import {
  LEXICAL_PROFILE_VERSION,
  PersistenceRagLexicalSearchFormatter,
} from '../../../src/Infrastructure/Persistence/Formatters/rag-lexical-search.formatter.js'
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
const lexicalFormatter = new PersistenceRagLexicalSearchFormatter()

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
      const originalProjectName = `idempotency-test-${fixtureId}`
      const requestedProjectName = `renamed-${fixtureId}`
      const base = await bases.save(bases.create({ projectId, projectName: originalProjectName }))
      const knowledgeBaseRepository = new TypeOrmRagKnowledgeBaseRepository(bases)
      const chunkRepository = new TypeOrmRagChunkRepository()
      const relationRepository = new TypeOrmRagDocumentRelationRepository()
      const documentIndexRepository = new TypeOrmRagDocumentIndexRepository(indexes)
      const failedJobRepository = new TypeOrmRagFailedJobRepository(failedJobs)
      const jobRepository = new TypeOrmRagJobRepository(jobs)
      const membershipRepository = new TypeOrmRagMembershipRepository(memberships)
      const documentRepository = new TypeOrmRagDocumentRepository(documents)
      const repository = new TypeOrmRagRepository(
        indexes,
        jobRepository,
        membershipRepository,
        documentIndexRepository,
        knowledgeBaseRepository,
        documentRepository,
        new TypeOrmRagDocumentRevisionRepository(revisions),
        failedJobRepository,
        chunkRepository,
        relationRepository,
        new TypeOrmRagJobClaimRepository(jobs),
      )
      const claimNext = () =>
        new ClaimNextRagJobUseCase(repository, new NodeRagCryptographyAdapter(), config.workerLeaseSeconds)
      const completeIndexJob = new CompleteRagIndexJobUseCase(repository)
      const pipelineSettings = {
        embeddingModel: config.embeddingModel,
        embeddingDimensions: config.embeddingDimensions,
        chunkingModel: config.chunkingModel,
        chunkingProfile: MarkdownChunkFactory.chunkingProfile,
        embeddingProfile: `mean-pooling-normalized:${config.embeddingDimensions}`,
        lexicalProfile: LEXICAL_PROFILE_VERSION,
        relationProfile: MarkdownChunkFactory.relationProfile,
      }
      const pipelineAssembler = new RagIndexRequestAssembler(pipelineSettings)
      const requestIndex = new RequestRagIndexUseCase(
        repository,
        new NodeRagCryptographyAdapter(),
        pipelineSettings,
        pipelineAssembler,
      )
      const prune = new PruneRagMembershipsUseCase(repository)
      const collectGarbage = new CollectRagGarbageUseCase(repository, config)
      const input = {
        knowledgeBaseId: base.id,
        projectId: base.projectId,
        projectName: requestedProjectName,
        sourceType: RagSourceTypeEnum.REPOSITORY,
        sourceKey: fixtureId,
        sourcePath: `${fixtureId}.md`,
        title: 'Idempotency fixture',
        content: '## Stable source\n\nA repeated index request must reuse the active ready index.',
      }
      await assert.rejects(
        requestIndex.execute({ ...input, projectId: `other-project-${fixtureId}` }),
        KnowledgeBaseProjectMismatchException,
      )
      assert.equal((await bases.findOneByOrFail({ id: base.id })).projectName, originalProjectName)
      const first = await requestIndex.execute(input)
      assert.equal((await bases.findOneByOrFail({ id: base.id })).projectName, requestedProjectName)
      assert.ok(typeof first.jobId === 'string')
      const initialJob = await jobs.findOneByOrFail({ id: first.jobId })
      assert.deepEqual(initialJob.payload, {}, 'queued payloads must not duplicate source content or title')
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
      const claim = await claimNext().execute()
      assert.ok(claim)
      assert.equal(claim.id, first.jobId, "the worker must claim this fixture's queued job")
      const plan = MarkdownChunkFactory.plan(input.content)
      const vectors = plan.chunks.map((_, ordinal) =>
        Array.from({ length: config.embeddingDimensions }, (_, dimension) => (dimension === ordinal ? 1 : 0)),
      )
      const planSavedAt = new Date()
      await new ReplaceIndexChunkUseCase(repository).execute(
        claim,
        plan,
        vectors,
        plan.chunks.map((chunk) => lexicalFormatter.format(chunk.content).searchText),
        planSavedAt,
      )
      await completeIndexJob.execute(claim, new Date())

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

      const changedInput = {
        ...input,
        title: 'Changed idempotency fixture',
        content: `${input.content}\n\nA second revision is queued while the first remains active.`,
      }
      const changedRequest = await requestIndex.execute(changedInput)
      assert.ok(typeof changedRequest.jobId === 'string')
      const changedJob = await jobs.findOneByOrFail({ id: changedRequest.jobId })
      assert.deepEqual(changedJob.payload, {}, 'indexing jobs must store parameters without source text')
      const changedClaim = await claimNext().execute()
      assert.ok(changedClaim)
      assert.equal(changedClaim.id, changedRequest.jobId)
      const changedPlan = MarkdownChunkFactory.plan(changedInput.content)
      const changedVectors = changedPlan.chunks.map((_, ordinal) =>
        Array.from({ length: config.embeddingDimensions }, (_, dimension) => (dimension === ordinal ? 1 : 0)),
      )
      const changedPlanSavedAt = new Date()
      await new ReplaceIndexChunkUseCase(repository).execute(
        changedClaim,
        changedPlan,
        changedVectors,
        changedPlan.chunks.map((chunk) => lexicalFormatter.format(chunk.content).searchText),
        changedPlanSavedAt,
      )

      const expiredMarker = new Date(Date.now() - config.gcRetentionMs - 1000)
      await indexes.update(repeated.documentIndexId, { unreferencedSince: expiredMarker })
      await indexes.update(changedRequest.documentIndexId, { unreferencedSince: expiredMarker })
      let completionManager: object | undefined
      let signalCompletionDocumentLock!: () => void
      let signalGarbageCollectionDocumentLock!: () => void
      let releaseCompletionDocumentLock!: () => void
      const completionDocumentLock = new Promise<void>((resolve) => {
        signalCompletionDocumentLock = resolve
      })
      const garbageCollectionDocumentLock = new Promise<void>((resolve) => {
        signalGarbageCollectionDocumentLock = resolve
      })
      const completionLockRelease = new Promise<void>((resolve) => {
        releaseCompletionDocumentLock = resolve
      })
      const completionIndexLockOrder: string[] = []
      let pausedCompletion = false
      const originalDocumentLock = documentRepository.lockById.bind(documentRepository)
      const originalIndexLock = documentIndexRepository.lockById.bind(documentIndexRepository)
      documentRepository.lockById = async (manager, documentId) => {
        completionManager ??= manager

        if (manager !== completionManager) signalGarbageCollectionDocumentLock()

        const lockedDocument = await originalDocumentLock(manager, documentId)

        if (manager === completionManager && documentId === document.id && !pausedCompletion) {
          pausedCompletion = true
          signalCompletionDocumentLock()
          await completionLockRelease
        }

        return lockedDocument
      }
      documentIndexRepository.lockById = async (manager, documentIndexId) => {
        if (manager === completionManager) completionIndexLockOrder.push(documentIndexId)

        return originalIndexLock(manager, documentIndexId)
      }
      try {
        const completion = completeIndexJob.execute(changedClaim, new Date())
        await completionDocumentLock
        const garbageCollection = collectGarbage.execute()
        await garbageCollectionDocumentLock
        releaseCompletionDocumentLock()
        await Promise.all([completion, garbageCollection])
      } finally {
        releaseCompletionDocumentLock()
        documentRepository.lockById = originalDocumentLock
        documentIndexRepository.lockById = originalIndexLock
      }
      assert.deepEqual(completionIndexLockOrder, [repeated.documentIndexId, changedRequest.documentIndexId].sort())
      assert.equal(
        (await memberships.findOneByOrFail({ knowledgeBaseId: base.id, documentId: document.id }))
          .activeDocumentIndexId,
        changedRequest.documentIndexId,
        'completion must activate its target after taking the document lock ahead of garbage collection',
      )
      assert.equal(
        (await indexes.findOneByOrFail({ id: changedRequest.documentIndexId })).unreferencedSince,
        null,
        'completion must clear an expired marker from the activated index',
      )
      assert.ok(
        (await indexes.findOneByOrFail({ id: repeated.documentIndexId })).unreferencedSince!.getTime() >
          expiredMarker.getTime(),
        'completion must refresh the previous index marker before garbage collection resumes',
      )

      const latestActiveRequest = await requestIndex.execute(input)
      const latestMembership = await memberships.findOneByOrFail({ knowledgeBaseId: base.id, documentId: document.id })
      assert.equal(latestActiveRequest.documentIndexId, repeated.documentIndexId)
      assert.equal(latestActiveRequest.jobId, null)
      assert.equal(latestActiveRequest.generation, changedRequest.generation + 1)
      assert.equal(latestMembership.activeDocumentIndexId, repeated.documentIndexId)
      assert.equal(Number(latestMembership.requestedGeneration), latestActiveRequest.generation)
      assert.equal(await jobs.countBy({ knowledgeBaseId: base.id, documentId: document.id }), 0)
      await assert.rejects(completeIndexJob.execute(changedClaim, new Date()), InvalidRagJobLeaseException)
      assert.equal(
        (await memberships.findOneByOrFail({ knowledgeBaseId: base.id, documentId: document.id }))
          .activeDocumentIndexId,
        repeated.documentIndexId,
        'a worker for the superseded revision must not replace the latest ready index',
      )

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
      const firstSharedClaim = await claimNext().execute()
      assert.ok(firstSharedClaim, 'one of the shared-index jobs must be claimed')
      assert.equal(await claimNext().execute(), null, 'the other job waits for the shared index build')
      const sharedPlanSavedAt = new Date()
      await new ReplaceIndexChunkUseCase(repository).execute(
        firstSharedClaim,
        sharedPlan,
        sharedVectors,
        sharedPlan.chunks.map((chunk) => lexicalFormatter.format(chunk.content).searchText),
        sharedPlanSavedAt,
      )
      await completeIndexJob.execute(firstSharedClaim, new Date())
      assert.equal(await claimNext().execute(), null, 'the remaining job activates the ready index without rebuilding')
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

      const lateReuseBase = await bases.save(
        bases.create({
          projectId: `late-shared-index-reuse-project-${fixtureId}`,
          projectName: `late-shared-index-reuse-${fixtureId}`,
        }),
      )
      const lateReuseRequest = await requestIndex.execute({
        ...sharedInput,
        knowledgeBaseId: lateReuseBase.id,
        projectId: lateReuseBase.projectId,
        projectName: lateReuseBase.projectName,
      })
      assert.equal(lateReuseRequest.documentIndexId, sharedIndexId)
      assert.equal(lateReuseRequest.reusedReadyIndex, true)
      assert.equal(
        (await indexes.findOneByOrFail({ id: sharedIndexId })).unreferencedSince,
        null,
        'reactivating an expired ready index must clear its unreferenced marker',
      )

      await prune.execute({
        projectId: sharedBases[0]!.projectId,
        knowledgeBaseId: sharedBases[0]!.id,
        documentIds: [],
      })
      assert.equal(await collectGarbage.execute(), 0, 'GC must preserve an index still shared by another membership')
      assert.equal(await chunks.countBy({ documentIndexId: sharedIndexId }), sharedPlan.chunks.length)

      await prune.execute({
        projectId: sharedBases[1]!.projectId,
        knowledgeBaseId: sharedBases[1]!.id,
        documentIds: [],
      })
      assert.equal(await collectGarbage.execute(), 0, 'GC must preserve the index reused by remaining memberships')
      await prune.execute({ projectId: readyReuseBase.projectId, knowledgeBaseId: readyReuseBase.id, documentIds: [] })
      assert.equal(await collectGarbage.execute(), 0, 'GC must preserve the index reused by a later membership')
      await prune.execute({ projectId: lateReuseBase.projectId, knowledgeBaseId: lateReuseBase.id, documentIds: [] })
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
          status: RAG_DOCUMENT_INDEX_STATUS.READY,
          readyAt: new Date(),
          unreferencedSince: new Date(Date.now() - config.gcRetentionMs - 1000),
        }),
      )
      assert.equal(await collectGarbage.execute(), 1, 'GC must remove a separately orphaned, expired index')
      assert.equal(await indexes.countBy({ id: orphanIndex.id }), 0)

      const staleTargetInput = {
        ...input,
        sourceKey: `stale-prepared-target-${fixtureId}`,
        sourcePath: `stale-prepared-target-${fixtureId}.md`,
        content: 'Index preparation and enqueue must share one database transaction.',
      }
      const staleTargetCryptography = new NodeRagCryptographyAdapter()
      const staleTargetContentHash = staleTargetCryptography.sha256(staleTargetInput.content)
      const staleTargetPipeline = pipelineAssembler.assemblePipeline({
        contentSha256: staleTargetContentHash,
        pipelineHash: staleTargetCryptography.sha256(
          pipelineAssembler.serializePipelineHashInput({
            contentSha256: staleTargetContentHash,
            embeddingModel: pipelineSettings.embeddingModel,
            embeddingDimensions: pipelineSettings.embeddingDimensions,
            chunkingModel: pipelineSettings.chunkingModel,
            context: undefined,
          }),
        ),
      })
      const rollbackProjectId = `request-rollback-project-${fixtureId}`
      const rollbackKnowledgeBaseId = randomUUID()
      await assert.rejects(
        repository.withTransaction(async (transaction) => {
          await transaction.createKnowledgeBase(
            RagKnowledgeBase.create({
              id: rollbackKnowledgeBaseId,
              projectId: rollbackProjectId,
              projectName: `request-rollback-${fixtureId}`,
            }),
          )
          const { documentId } = await transaction.ensureSource({
            sourceType: staleTargetInput.sourceType,
            sourceKey: staleTargetInput.sourceKey,
            sourcePath: staleTargetInput.sourcePath,
            ...(staleTargetInput.title === undefined ? {} : { currentTitle: staleTargetInput.title }),
          })
          assert.equal(await transaction.lockDocument(documentId), true)
          await transaction.createMembershipIfMissing({
            knowledgeBaseId: rollbackKnowledgeBaseId,
            documentId,
            initialState: {
              requestedGeneration: 0,
              activeDocumentIndexId: null,
              isEntry: false,
              alwaysIncludeFullContent: false,
            },
          })
          const membership = await transaction.lockMembership(rollbackKnowledgeBaseId, documentId)
          assert.ok(membership)
          const { revisionId } = await transaction.findOrCreateRevision({
            documentId,
            contentSha256: staleTargetContentHash,
            title: staleTargetInput.title ?? null,
            content: staleTargetInput.content,
          })
          const index = await transaction.findOrCreateIndex({
            documentId,
            revisionId,
            ...staleTargetPipeline,
            initialState: {
              status: RAG_DOCUMENT_INDEX_STATUS.BUILDING,
              readyAt: null,
              unreferencedSince: null,
            },
          })
          await transaction.lockCurrentJob(rollbackKnowledgeBaseId, documentId)
          await transaction.lockIndexesById([index.id])
          await transaction.updateMembershipRequest({
            knowledgeBaseId: rollbackKnowledgeBaseId,
            documentId,
            requestedGeneration: 1,
            activeDocumentIndexId: null,
          })
          await transaction.enqueueJob({
            knowledgeBaseId: rollbackKnowledgeBaseId,
            documentId,
            documentIndexId: index.id,
            generation: 1,
            status: RAG_JOB_STATUS.QUEUED,
            attempts: 0,
            availableAt: new Date(),
            payload: {},
          })
          throw new Error('force transaction rollback after enqueue')
        }),
        /force transaction rollback after enqueue/,
      )
      assert.equal(await bases.countBy({ projectId: rollbackProjectId }), 0)
      assert.equal(await documents.countBy({ sourceKey: staleTargetInput.sourceKey }), 0)
      assert.equal(await memberships.countBy({ knowledgeBaseId: rollbackKnowledgeBaseId }), 0)
      assert.equal(await jobs.countBy({ knowledgeBaseId: rollbackKnowledgeBaseId }), 0)

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
      assert.equal(
        await memberships.countBy({ documentId: concurrentRequests[0]!.documentId }),
        2,
        'concurrent requests from separate knowledge bases must both keep their membership',
      )

      const gcOrphanDocument = await documents.save(
        documents.create({
          sourceType: RagSourceTypeEnum.REPOSITORY,
          sourceKey: `gc-orphan-${fixtureId}`,
          sourcePath: `${fixtureId}/orphan.md`,
          currentTitle: 'GC orphan fixture',
          unreferencedSince: null,
        }),
      )
      const gcUnmarkedDocument = await documents.save(
        documents.create({
          sourceType: RagSourceTypeEnum.REPOSITORY,
          sourceKey: `gc-unmarked-${fixtureId}`,
          sourcePath: `${fixtureId}/unmarked.md`,
          currentTitle: 'GC unmarked fixture',
          unreferencedSince: null,
        }),
      )
      const gcOrphanRevision = await revisions.save(
        revisions.create({
          documentId: gcOrphanDocument.id,
          contentSha256: randomUUID().replaceAll('-', '').padEnd(64, '0'),
          title: 'GC orphan fixture',
          content: 'This revision has no index reference.',
        }),
      )
      const futureCutoff = new Date(Date.now() + 60_000)
      const gcOrphanRevisionId = gcOrphanRevision.id
      const gcOrphanDocumentId = gcOrphanDocument.id
      const expiredAt = new Date(Date.now() - config.gcRetentionMs - 1_000)
      await documents.update({ id: document.id }, { unreferencedSince: expiredAt })
      const activeRevisionIds = new Set((await indexes.find()).map((index) => index.revisionId))
      assert.equal(activeRevisionIds.has(gcOrphanRevisionId), false)

      await repository.withGarbageCollectionTransaction(async (gc) => {
        const revisionCandidates = await gc.findGarbageRevisionCandidates(futureCutoff)
        assert.ok(revisionCandidates.some((candidate) => candidate.documentRevisionId === gcOrphanRevisionId))
        const referencedRevisionCandidate = revisionCandidates.find((candidate) =>
          activeRevisionIds.has(candidate.documentRevisionId),
        )
        assert.ok(referencedRevisionCandidate, 'reference checks are deferred until after the candidate is locked')
        const lockedReferencedRevision = await gc.lockGarbageRevision(referencedRevisionCandidate.documentRevisionId)
        assert.ok(lockedReferencedRevision)
        assert.ok((await gc.countIndexesForRevision(lockedReferencedRevision.documentRevisionId)) > 0)

        assert.ok(await gc.lockGarbageDocument(gcOrphanDocumentId))
        const lockedOrphanRevision = await gc.lockGarbageRevision(gcOrphanRevisionId)
        assert.ok(lockedOrphanRevision)
        assert.ok(lockedOrphanRevision.createdAt.getTime() <= futureCutoff.getTime())
        assert.equal(await gc.countIndexesForRevision(gcOrphanRevisionId), 0)
        await gc.removeGarbageRevision(gcOrphanRevisionId)
        await gc.markDocumentUnreferenced(gcOrphanDocumentId, expiredAt)

        const documentCandidates = await gc.findGarbageDocumentCandidates(futureCutoff)
        assert.ok(documentCandidates.some((candidate) => candidate.documentId === gcOrphanDocumentId))
        assert.equal(
          documentCandidates.some((candidate) => candidate.documentId === gcUnmarkedDocument.id),
          false,
          'documents with no unreferenced timestamp are not GC candidates',
        )
        const referencedDocumentCandidate = documentCandidates.find((candidate) => candidate.documentId === document.id)
        assert.ok(
          referencedDocumentCandidate,
          'membership reference checks are deferred until after the candidate is locked',
        )
        const lockedReferencedDocument = await gc.lockGarbageDocument(document.id)
        assert.ok(lockedReferencedDocument)
        assert.ok(
          (await gc.countMembershipsForDocument(document.id)) > 0,
          'GC must retain documents still attached to a knowledge-base membership',
        )

        const lockedOrphanDocument = await gc.lockGarbageDocument(gcOrphanDocumentId)
        assert.ok(lockedOrphanDocument)
        assert.ok(lockedOrphanDocument.unreferencedSince)
        assert.ok(lockedOrphanDocument.unreferencedSince.getTime() <= futureCutoff.getTime())
        assert.deepEqual(
          {
            membershipCount: await gc.countMembershipsForDocument(gcOrphanDocumentId),
            revisionCount: await gc.countRevisionsForDocument(gcOrphanDocumentId),
            indexCount: await gc.countIndexesForDocument(gcOrphanDocumentId),
            jobCount: await gc.countJobsForDocument(gcOrphanDocumentId),
            failedJobCount: await gc.countFailedJobsForDocument(gcOrphanDocumentId),
            relationCount: await gc.countRelationsTargetingDocument(gcOrphanDocumentId),
          },
          {
            membershipCount: 0,
            revisionCount: 0,
            indexCount: 0,
            jobCount: 0,
            failedJobCount: 0,
            relationCount: 0,
          },
        )
        await gc.removeGarbageDocument(gcOrphanDocumentId)
      })

      assert.equal(await revisions.findOneBy({ id: gcOrphanRevisionId }), null)
      assert.equal(await documents.findOneBy({ id: gcOrphanDocumentId }), null)

      const raceSourceKey = `gc-request-race-${fixtureId}`
      const raceSource = await documents.save(
        documents.create({
          sourceType: RagSourceTypeEnum.REPOSITORY,
          sourceKey: raceSourceKey,
          sourcePath: `${fixtureId}/race.md`,
          currentTitle: 'GC request race fixture',
          unreferencedSince: expiredAt,
        }),
      )
      let signalDocumentLocked!: () => void
      let releaseGarbageCollection!: () => void
      const documentLocked = new Promise<void>((resolve) => {
        signalDocumentLocked = resolve
      })
      const allowGarbageCollection = new Promise<void>((resolve) => {
        releaseGarbageCollection = resolve
      })
      const collection = repository.withGarbageCollectionTransaction(async (gc) => {
        const locked = await gc.lockGarbageDocument(raceSource.id)
        assert.ok(locked)
        assert.deepEqual(
          {
            membershipCount: await gc.countMembershipsForDocument(raceSource.id),
            revisionCount: await gc.countRevisionsForDocument(raceSource.id),
            indexCount: await gc.countIndexesForDocument(raceSource.id),
            jobCount: await gc.countJobsForDocument(raceSource.id),
            failedJobCount: await gc.countFailedJobsForDocument(raceSource.id),
            relationCount: await gc.countRelationsTargetingDocument(raceSource.id),
          },
          {
            membershipCount: 0,
            revisionCount: 0,
            indexCount: 0,
            jobCount: 0,
            failedJobCount: 0,
            relationCount: 0,
          },
        )
        signalDocumentLocked()
        await allowGarbageCollection
        await gc.removeGarbageDocument(raceSource.id)
      })
      await documentLocked
      let requestSettled = false
      const concurrentRequest = requestIndex
        .execute({
          ...input,
          sourceKey: raceSourceKey,
          sourcePath: `${fixtureId}/race.md`,
        })
        .then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        )
        .finally(() => {
          requestSettled = true
        })
      await new Promise((resolve) => setTimeout(resolve, 40))
      assert.equal(requestSettled, false, 'source upsert must wait for the GC document row lock')
      releaseGarbageCollection()
      await collection
      const raceRequestOutcome = await concurrentRequest
      assert.ok('value' in raceRequestOutcome, 'a concurrent request must recover after GC removes its stale source')
      const raceRequestResult = raceRequestOutcome.value
      assert.notEqual(
        raceRequestResult.documentId,
        raceSource.id,
        'the request recreates the source after GC deletes it',
      )
      assert.equal(await documents.findOneBy({ id: raceSource.id }), null)
      const recoveredSource = await documents.findOneByOrFail({
        sourceType: RagSourceTypeEnum.REPOSITORY,
        sourceKey: raceSourceKey,
        sourcePath: `${fixtureId}/race.md`,
      })
      assert.equal(raceRequestResult.documentId, recoveredSource.id)
      assert.equal(
        recoveredSource.unreferencedSince,
        null,
        'a successful request must clear the expired retention marker',
      )
      assert.ok(await memberships.findOneBy({ knowledgeBaseId: base.id, documentId: recoveredSource.id }))
    } finally {
      await cleanup()
    }
  },
)
