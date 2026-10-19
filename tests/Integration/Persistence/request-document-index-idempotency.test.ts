import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { In } from 'typeorm'

import { CHUNKING_PROFILE_VERSION, RELATION_PROFILE_VERSION } from '../../../config/chunk-planning-profile.config.ts'
import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { CollectIndexChunkGarbageUseCase } from '../../../src/Application/Chunks/UseCases/collect-index-chunk-garbage.use-case.ts'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/Chunks/UseCases/replace-index-chunk.use-case.ts'
import { WriteRequestDocumentIndexesAssembler } from '../../../src/Application/DocumentIndexes/Assemblers/write-request-document-indexes.assembler.ts'
import { DocumentIndexingRequestedEvent } from '../../../src/Application/DocumentIndexes/Events/document-indexing-requested.event.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-document-index-execution-lease.exception.ts'
import { CancelKnowledgeBaseDocumentDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/cancel-knowledge-base-document-document-indexing.listener.ts'
import { DispatchDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/dispatch-document-indexing.listener.ts'
import { DocumentIndexedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexed.listener.ts'
import { DocumentIndexingRequestedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexing-requested.listener.ts'
import { AuthorizeDocumentIndexChunkReplacementUseCase } from '../../../src/Application/DocumentIndexes/UseCases/authorize-document-index-chunk-replacement.use-case.ts'
import { CollectDocumentIndexGarbageUseCase } from '../../../src/Application/DocumentIndexes/UseCases/collect-document-index-garbage.use-case.ts'
import { InspectDocumentIndexRetentionUseCase } from '../../../src/Application/DocumentIndexes/UseCases/inspect-document-index-retention.use-case.ts'
import { PlanDocumentIndexGarbageUseCase } from '../../../src/Application/DocumentIndexes/UseCases/plan-document-index-garbage.use-case.ts'
import { StartDocumentIndexPruningRetentionUseCase } from '../../../src/Application/DocumentIndexes/UseCases/start-document-index-pruning-retention.use-case.ts'
import { CollectDocumentRelationGarbageUseCase } from '../../../src/Application/DocumentRelations/UseCases/collect-document-relation-garbage.use-case.ts'
import { InspectDocumentRelationRetentionUseCase } from '../../../src/Application/DocumentRelations/UseCases/inspect-document-relation-retention.use-case.ts'
import { PlanDocumentRelationGarbageUseCase } from '../../../src/Application/DocumentRelations/UseCases/plan-document-relation-garbage.use-case.ts'
import { ReplacePlannedDocumentRelationsUseCase } from '../../../src/Application/DocumentRelations/UseCases/replace-planned-document-relations.use-case.ts'
import { CollectDocumentRevisionGarbageUseCase } from '../../../src/Application/DocumentRevisions/UseCases/collect-document-revision-garbage.use-case.ts'
import { InspectDocumentRevisionRetentionUseCase } from '../../../src/Application/DocumentRevisions/UseCases/inspect-document-revision-retention.use-case.ts'
import { PlanDocumentRevisionGarbageUseCase } from '../../../src/Application/DocumentRevisions/UseCases/plan-document-revision-garbage.use-case.ts'
import { PrepareDocumentRevisionForIndexRequestUseCase } from '../../../src/Application/DocumentRevisions/UseCases/prepare-document-revision-for-index-request.use-case.ts'
import { DocumentGarbageCollectionRequestedEvent } from '../../../src/Application/Documents/Events/document-garbage-collection-requested.event.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../src/Application/Documents/Listeners/document-garbage-collection-requested.listener.ts'
import { InspectDocumentRetentionUseCase } from '../../../src/Application/Documents/UseCases/inspect-document-retention.use-case.ts'
import { LockDocumentRetentionParentsUseCase } from '../../../src/Application/Documents/UseCases/lock-document-retention-parents.use-case.ts'
import { PrepareDocumentForIndexRequestUseCase } from '../../../src/Application/Documents/UseCases/prepare-document-for-index-request.use-case.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import { StartDocumentPruningRetentionUseCase } from '../../../src/Application/Documents/UseCases/start-document-pruning-retention.use-case.ts'
import { ActivateKnowledgeBaseDocumentIndexUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/activate-knowledge-base-document-index.use-case.ts'
import { CompleteKnowledgeBaseDocumentIndexingUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/complete-knowledge-base-document-indexing.use-case.ts'
import { InspectKnowledgeBaseDocumentRetentionUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/inspect-knowledge-base-document-retention.use-case.ts'
import { PrepareKnowledgeBaseDocumentForIndexRequestUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/prepare-knowledge-base-document-for-index-request.use-case.ts'
import { PruneKnowledgeBaseDocumentsUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/prune-knowledge-base-documents.use-case.ts'
import { ReserveKnowledgeBaseDocumentForIndexingUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/reserve-knowledge-base-document-for-indexing.use-case.ts'
import { SaveKnowledgeBaseDocumentIndexRequestUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/save-knowledge-base-document-index-request.use-case.ts'
import { EnsureIndexingKnowledgeBaseUseCase } from '../../../src/Application/KnowledgeBases/UseCases/ensure-indexing-knowledge-base.use-case.ts'
import { GetIndexingKnowledgeBaseUseCase } from '../../../src/Application/KnowledgeBases/UseCases/get-indexing-knowledge-base.use-case.ts'
import { ValidateKnowledgeBasePruningUseCase } from '../../../src/Application/KnowledgeBases/UseCases/validate-knowledge-base-pruning.use-case.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { KnowledgeBaseProjectMismatchException } from '../../../src/Domain/KnowledgeBase/Exceptions/knowledge-base-project-mismatch.exception.ts'
import { LEXICAL_PROFILE_VERSION } from '../../../src/Infrastructure/Persistence/Adapters/lexical-search-query.adapter.ts'
import { ChunkModel } from '../../../src/Infrastructure/Persistence/Models/chunk.model.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { JobModel } from '../../../src/Infrastructure/Persistence/Models/job.model.ts'
import { KnowledgeBaseDocumentModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { ChunkRepository } from '../../../src/Infrastructure/Persistence/Repositories/chunk.repository.ts'
import { DocumentIndexSuccessReceiptRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index-success-receipt.repository.ts'
import { DocumentIndexRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index.repository.ts'
import { DocumentRelationRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-relation.repository.ts'
import { DocumentRevisionRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-revision.repository.ts'
import { DocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/document.repository.ts'
import { FailedJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../../src/Infrastructure/Persistence/Repositories/job.repository.ts'
import { KnowledgeBaseDocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base-document.repository.ts'
import { KnowledgeBaseRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base.repository.ts'
import { DocumentIndexPersistenceFixture } from '../../Support/document-index-persistence.fixture.ts'
import { createMarkdownChunkPlan } from '../../Support/markdown-chunk-plan.fixture.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

const config: KnowledgeServiceConfig = {
  port: 30700,
  databaseUrl: 'postgres://unused',
  databaseSchema: 'public',
  embeddingModel: 'integration-test-model',
  embeddingDimensions: 384,
  embeddingTransport: 'http',
  embeddingRevision: '',
  embeddingCacheDir: '/unused',
  embeddingApiUrl: 'https://unused.invalid',
  chunkingTransport: 'http',
  chunkingCliPath: 'codex',
  chunkingCliMaxOutputBytes: 4194304,
  chunkingModel: 'integration-test-chunker',
  chunkingApiUrl: 'https://unused.invalid',
  workerPollMs: 1000,
  gcPollMs: 60000,
  gcRetentionMs: 86400000,
  workerLeaseSeconds: 30,
  externalRequestTimeoutMs: 30000,
  serviceAuthSecret: 'integration-test-secret',
}

test(
  'requesting an already active ready index reuses it without a new generation or job',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)
    try {
      const knowledgeBaseModelRepository = dataSource.getRepository(KnowledgeBaseModel)
      const documentModelRepository = dataSource.getRepository(DocumentModel)
      const documentRevisionModelRepository = dataSource.getRepository(DocumentRevisionModel)
      const documentIndexModelRepository = dataSource.getRepository(DocumentIndexModel)
      const knowledgeBaseDocumentModelRepository = dataSource.getRepository(KnowledgeBaseDocumentModel)
      const jobModelRepository = dataSource.getRepository(JobModel)
      const chunkModelRepository = dataSource.getRepository(ChunkModel)
      const fixtureId = randomUUID()
      const projectId = `idempotency-project-${fixtureId}`
      const originalProjectName = `idempotency-test-${fixtureId}`
      const requestedProjectName = `renamed-${fixtureId}`
      const base = await knowledgeBaseModelRepository.save(
        knowledgeBaseModelRepository.create({ projectId, projectName: originalProjectName }),
      )
      const knowledgeBaseRepository = new KnowledgeBaseRepository(persistenceTransaction)
      const chunkRepository = new ChunkRepository(persistenceTransaction, retrievalDataSource)
      const documentRelationRepository = new DocumentRelationRepository(persistenceTransaction)
      const documentIndexRepository = new DocumentIndexRepository(persistenceTransaction)
      const failedJobRepository = new FailedJobRepository(persistenceTransaction)
      const jobRepository = new JobRepository(persistenceTransaction)
      const knowledgeBaseDocumentRepository = new KnowledgeBaseDocumentRepository(persistenceTransaction)
      const documentRepository = new DocumentRepository(persistenceTransaction)
      const documentIndexPersistenceFixture = new DocumentIndexPersistenceFixture(
        persistenceTransaction,
        jobRepository,
        knowledgeBaseDocumentRepository,
        documentIndexRepository,
        knowledgeBaseRepository,
        documentRepository,
        new DocumentRevisionRepository(persistenceTransaction),
        failedJobRepository,
        chunkRepository,
        documentRelationRepository,
      )
      const claimNext = () =>
        new DispatchDocumentIndexingListener(
          documentIndexPersistenceFixture.persistenceTransaction,
          new ReserveDocumentForIndexingUseCase(documentIndexPersistenceFixture.documentRepository),
          new ReserveKnowledgeBaseDocumentForIndexingUseCase(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
          documentIndexPersistenceFixture.documentIndexRepository,
          documentIndexPersistenceFixture.jobRepository,
          documentIndexPersistenceFixture.failedJobRepository,
          config.workerLeaseSeconds,
          new ActivateKnowledgeBaseDocumentIndexUseCase(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
          new GetIndexingKnowledgeBaseUseCase(documentIndexPersistenceFixture.knowledgeBaseRepository),
          new DocumentIndexSuccessReceiptRepository(documentIndexPersistenceFixture.persistenceTransaction),
        )
      const completeJob = new DocumentIndexedListener(
        documentIndexPersistenceFixture.persistenceTransaction,
        new ReserveDocumentForIndexingUseCase(documentIndexPersistenceFixture.documentRepository),
        new ReserveKnowledgeBaseDocumentForIndexingUseCase(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
        documentIndexPersistenceFixture.jobRepository,
        documentIndexPersistenceFixture.documentIndexRepository,
        new CompleteKnowledgeBaseDocumentIndexingUseCase(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
        new GetIndexingKnowledgeBaseUseCase(documentIndexPersistenceFixture.knowledgeBaseRepository),
        new DocumentIndexSuccessReceiptRepository(documentIndexPersistenceFixture.persistenceTransaction),
      )
      const pipelineSettings = {
        embeddingModel: config.embeddingModel,
        embeddingDimensions: config.embeddingDimensions,
        chunkingModel: config.chunkingModel,
        chunkingProfile: CHUNKING_PROFILE_VERSION,
        embeddingProfile: `mean-pooling-normalized:${config.embeddingDimensions}`,
        lexicalProfile: LEXICAL_PROFILE_VERSION,
        relationProfile: RELATION_PROFILE_VERSION,
      }
      const writeRequestDocumentIndexesAssembler = new WriteRequestDocumentIndexesAssembler(pipelineSettings)
      const requestIndex = new DocumentIndexingRequestedListener(
        documentIndexPersistenceFixture.persistenceTransaction,
        new EnsureIndexingKnowledgeBaseUseCase(documentIndexPersistenceFixture.knowledgeBaseRepository),
        new PrepareDocumentForIndexRequestUseCase(documentIndexPersistenceFixture.documentRepository),
        new PrepareKnowledgeBaseDocumentForIndexRequestUseCase(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
        new PrepareDocumentRevisionForIndexRequestUseCase(documentIndexPersistenceFixture.documentRevisionRepository),
        documentIndexPersistenceFixture.documentIndexRepository,
        documentIndexPersistenceFixture.jobRepository,
        documentIndexPersistenceFixture.failedJobRepository,
        pipelineSettings,
        writeRequestDocumentIndexesAssembler,
        new SaveKnowledgeBaseDocumentIndexRequestUseCase(
          documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        ),
        new StartDocumentIndexPruningRetentionUseCase(
          documentIndexPersistenceFixture.documentIndexRepository,
          documentIndexPersistenceFixture.jobRepository,
          new InspectKnowledgeBaseDocumentRetentionUseCase(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
        ),
      )
      const prune = new PruneKnowledgeBaseDocumentsUseCase(
        documentIndexPersistenceFixture.persistenceTransaction,
        new ValidateKnowledgeBasePruningUseCase(documentIndexPersistenceFixture.knowledgeBaseRepository),
        new LockDocumentRetentionParentsUseCase(documentIndexPersistenceFixture.documentRepository),
        documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
        {
          deliver: (event) =>
            new CancelKnowledgeBaseDocumentDocumentIndexingListener(
              documentIndexPersistenceFixture.jobRepository,
            ).handle(event),
        },
        new StartDocumentIndexPruningRetentionUseCase(
          documentIndexPersistenceFixture.documentIndexRepository,
          documentIndexPersistenceFixture.jobRepository,
          new InspectKnowledgeBaseDocumentRetentionUseCase(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
        ),
        new StartDocumentPruningRetentionUseCase(
          documentIndexPersistenceFixture.documentRepository,
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
        ),
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
        config,
        documentIndexPersistenceFixture.jobRepository,
        documentIndexPersistenceFixture.failedJobRepository,
      )
      const input = {
        knowledgeBaseId: base.id,
        projectId: base.projectId,
        projectName: requestedProjectName,
        sourceType: DocumentSourceTypeEnum.REPOSITORY,
        sourceKey: fixtureId,
        sourcePath: `${fixtureId}.md`,
        title: 'Idempotency fixture',
        content: '## Stable source\n\nA repeated index request must reuse the active ready index.',
      }
      await assert.rejects(
        requestIndex.handle(new DocumentIndexingRequestedEvent({ ...input, projectId: `other-project-${fixtureId}` })),
        KnowledgeBaseProjectMismatchException,
      )
      assert.equal(
        (await knowledgeBaseModelRepository.findOneByOrFail({ id: base.id })).projectName,
        originalProjectName,
      )
      const first = await requestIndex.handle(new DocumentIndexingRequestedEvent(input))
      assert.equal(
        (await knowledgeBaseModelRepository.findOneByOrFail({ id: base.id })).projectName,
        requestedProjectName,
      )
      assert.ok(typeof first.jobId === 'string')
      const initialJob = await jobModelRepository.findOneByOrFail({ id: first.jobId })
      assert.deepEqual(initialJob.payload, {}, 'queued payloads must not duplicate source content or title')
      initialJob.attempts = 2
      initialJob.availableAt = new Date(Date.now() - 1000)
      await jobModelRepository.save(initialJob)
      const repeatedQueuedRequest = await requestIndex.handle(new DocumentIndexingRequestedEvent(input))
      const preservedJob = await jobModelRepository.findOneByOrFail({ id: first.jobId })
      assert.equal(repeatedQueuedRequest.jobId, first.jobId)
      assert.equal(repeatedQueuedRequest.generation, first.generation)
      assert.equal(preservedJob.attempts, 2, 'same-target requests must preserve retry attempts')
      assert.equal(
        preservedJob.availableAt.getTime(),
        initialJob.availableAt.getTime(),
        'same-target requests must preserve retry backoff',
      )
      const claim = await claimNext().handle()
      assert.ok(claim)
      assert.equal(claim.id, first.jobId, "the worker must claim this fixture's queued job")
      const plan = createMarkdownChunkPlan(input.content)
      const vectors = plan.chunks.map((_, ordinal) =>
        Array.from({ length: config.embeddingDimensions }, (_, dimension) => (dimension === ordinal ? 1 : 0)),
      )
      const planSavedAt = new Date()
      await new ReplaceIndexChunkUseCase(
        documentIndexPersistenceFixture.persistenceTransaction,
        new AuthorizeDocumentIndexChunkReplacementUseCase(
          new ReserveDocumentForIndexingUseCase(documentIndexPersistenceFixture.documentRepository),
          new ReserveKnowledgeBaseDocumentForIndexingUseCase(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
          documentIndexPersistenceFixture.jobRepository,
          documentIndexPersistenceFixture.documentIndexRepository,
        ),
        documentIndexPersistenceFixture.chunkRepository,
        new ReplacePlannedDocumentRelationsUseCase(documentIndexPersistenceFixture.documentRelationRepository),
      ).execute({
        job: claim,
        markdownChunkPlan: plan,
        chunkEmbeddings: vectors,
        now: planSavedAt,
      })
      await completeJob.handle({ jobDelivery: claim, completedAt: new Date() })

      const document = await documentModelRepository.findOneByOrFail({ sourceKey: fixtureId })
      const knowledgeBaseDocument = await knowledgeBaseDocumentModelRepository.findOneByOrFail({
        knowledgeBaseId: base.id,
        documentId: document.id,
      })
      const indexCountBefore = await documentIndexModelRepository.countBy({ documentId: document.id })
      const repeated = await requestIndex.handle(new DocumentIndexingRequestedEvent(input))

      assert.equal(repeated.documentIndexId, knowledgeBaseDocument.activeDocumentIndexId)
      assert.equal(repeated.jobId, null)
      assert.equal(repeated.reusedReadyIndex, true)
      assert.equal(repeated.generation, knowledgeBaseDocument.requestedGeneration)
      assert.equal(await documentIndexModelRepository.countBy({ documentId: document.id }), indexCountBefore)
      assert.equal(await jobModelRepository.countBy({ knowledgeBaseId: base.id, documentId: document.id }), 0)

      const cancelledRunning = await requestIndex.handle(
        new DocumentIndexingRequestedEvent({ ...input, content: `${input.content}\n\nCancelled running revision.` }),
      )
      const cancelledClaim = await claimNext().handle()
      assert.equal(cancelledClaim?.id, cancelledRunning.jobId)
      const restoredReady = await requestIndex.handle(new DocumentIndexingRequestedEvent(input))
      assert.equal(restoredReady.documentIndexId, repeated.documentIndexId)
      assert.equal(await jobModelRepository.countBy({ id: cancelledRunning.jobId! }), 0)
      assert.ok(
        (await documentIndexModelRepository.findOneByOrFail({ id: cancelledRunning.documentIndexId }))
          .unreferencedSince instanceof Date,
        'switching from a running target to a ready index must start retention for the cancelled building index',
      )

      const cancelledQueued = await requestIndex.handle(
        new DocumentIndexingRequestedEvent({ ...input, content: `${input.content}\n\nCancelled queued revision.` }),
      )
      const replacementQueued = await requestIndex.handle(
        new DocumentIndexingRequestedEvent({ ...input, content: `${input.content}\n\nReplacement queued revision.` }),
      )
      assert.equal(await jobModelRepository.countBy({ id: cancelledQueued.jobId! }), 0)
      assert.ok(
        (await documentIndexModelRepository.findOneByOrFail({ id: cancelledQueued.documentIndexId }))
          .unreferencedSince instanceof Date,
        'enqueueing a different target must start retention for the superseded building index',
      )
      await requestIndex.handle(new DocumentIndexingRequestedEvent(input))
      const cancelledIndexIds = [
        cancelledRunning.documentIndexId,
        cancelledQueued.documentIndexId,
        replacementQueued.documentIndexId,
      ]
      await documentIndexModelRepository.update(
        { id: In(cancelledIndexIds) },
        { unreferencedSince: new Date(Date.now() - config.gcRetentionMs - 1000) },
      )
      await collectGarbage.handle(new DocumentGarbageCollectionRequestedEvent())
      assert.equal(await documentIndexModelRepository.countBy({ id: In(cancelledIndexIds) }), 0)
      assert.equal(await documentIndexModelRepository.countBy({ id: repeated.documentIndexId }), 1)
      assert.equal(await jobModelRepository.countBy({ knowledgeBaseId: base.id, documentId: document.id }), 0)

      const changedInput = {
        ...input,
        title: 'Changed idempotency fixture',
        content: `${input.content}\n\nA second revision is queued while the first remains active.`,
      }
      const changedRequest = await requestIndex.handle(new DocumentIndexingRequestedEvent(changedInput))
      assert.ok(typeof changedRequest.jobId === 'string')
      const changedJob = await jobModelRepository.findOneByOrFail({ id: changedRequest.jobId })
      assert.deepEqual(changedJob.payload, {}, 'indexing jobs must store parameters without source text')
      const changedClaim = await claimNext().handle()
      assert.ok(changedClaim)
      assert.equal(changedClaim.id, changedRequest.jobId)
      const changedPlan = createMarkdownChunkPlan(changedInput.content)
      const changedVectors = changedPlan.chunks.map((_, ordinal) =>
        Array.from({ length: config.embeddingDimensions }, (_, dimension) => (dimension === ordinal ? 1 : 0)),
      )
      const changedPlanSavedAt = new Date()
      await new ReplaceIndexChunkUseCase(
        documentIndexPersistenceFixture.persistenceTransaction,
        new AuthorizeDocumentIndexChunkReplacementUseCase(
          new ReserveDocumentForIndexingUseCase(documentIndexPersistenceFixture.documentRepository),
          new ReserveKnowledgeBaseDocumentForIndexingUseCase(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
          documentIndexPersistenceFixture.jobRepository,
          documentIndexPersistenceFixture.documentIndexRepository,
        ),
        documentIndexPersistenceFixture.chunkRepository,
        new ReplacePlannedDocumentRelationsUseCase(documentIndexPersistenceFixture.documentRelationRepository),
      ).execute({
        job: changedClaim,
        markdownChunkPlan: changedPlan,
        chunkEmbeddings: changedVectors,
        now: changedPlanSavedAt,
      })

      const expiredMarker = new Date(Date.now() - config.gcRetentionMs - 1000)
      await documentIndexModelRepository.update(repeated.documentIndexId, { unreferencedSince: expiredMarker })
      await documentIndexModelRepository.update(changedRequest.documentIndexId, { unreferencedSince: expiredMarker })
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
      const originalDocumentLock = documentRepository.lockByDocumentId.bind(documentRepository)
      const originalIndexLock = documentIndexRepository.lockByDocumentIndexId.bind(documentIndexRepository)
      documentRepository.lockByDocumentId = async (documentIdQO) => {
        const manager = persistenceTransaction.manager
        const { documentId } = documentIdQO
        completionManager ??= manager

        if (manager !== completionManager) signalGarbageCollectionDocumentLock()

        const lockedDocument = await originalDocumentLock(documentIdQO)

        if (manager === completionManager && documentId === document.id && !pausedCompletion) {
          pausedCompletion = true
          signalCompletionDocumentLock()
          await completionLockRelease
        }

        return lockedDocument
      }
      documentIndexRepository.lockByDocumentIndexId = async (documentIndexIdQO) => {
        const manager = persistenceTransaction.manager
        const { documentIndexId } = documentIndexIdQO

        if (manager === completionManager) completionIndexLockOrder.push(documentIndexId)

        return originalIndexLock(documentIndexIdQO)
      }
      try {
        const completion = completeJob.handle({ jobDelivery: changedClaim, completedAt: new Date() })
        await completionDocumentLock
        const garbageCollection = collectGarbage.handle(new DocumentGarbageCollectionRequestedEvent())
        await garbageCollectionDocumentLock
        releaseCompletionDocumentLock()
        await Promise.all([completion, garbageCollection])
      } finally {
        releaseCompletionDocumentLock()
        documentRepository.lockByDocumentId = originalDocumentLock
        documentIndexRepository.lockByDocumentIndexId = originalIndexLock
      }
      assert.deepEqual(completionIndexLockOrder, [repeated.documentIndexId, changedRequest.documentIndexId].sort())
      assert.equal(
        (
          await knowledgeBaseDocumentModelRepository.findOneByOrFail({
            knowledgeBaseId: base.id,
            documentId: document.id,
          })
        ).activeDocumentIndexId,
        changedRequest.documentIndexId,
        'completion must activate its target after taking the document lock ahead of garbage collection',
      )
      assert.equal(
        (await documentIndexModelRepository.findOneByOrFail({ id: changedRequest.documentIndexId })).unreferencedSince,
        null,
        'completion must clear an expired marker from the activated index',
      )
      assert.ok(
        (
          await documentIndexModelRepository.findOneByOrFail({ id: repeated.documentIndexId })
        ).unreferencedSince!.getTime() > expiredMarker.getTime(),
        'completion must refresh the previous index marker before garbage collection resumes',
      )

      const latestActiveRequest = await requestIndex.handle(new DocumentIndexingRequestedEvent(input))
      const latestKnowledgeBaseDocument = await knowledgeBaseDocumentModelRepository.findOneByOrFail({
        knowledgeBaseId: base.id,
        documentId: document.id,
      })
      assert.equal(latestActiveRequest.documentIndexId, repeated.documentIndexId)
      assert.equal(latestActiveRequest.jobId, null)
      assert.equal(latestActiveRequest.generation, (BigInt(changedRequest.generation) + 1n).toString())
      assert.equal(latestKnowledgeBaseDocument.activeDocumentIndexId, repeated.documentIndexId)
      assert.equal(latestKnowledgeBaseDocument.requestedGeneration, latestActiveRequest.generation)
      assert.equal(await jobModelRepository.countBy({ knowledgeBaseId: base.id, documentId: document.id }), 0)
      await assert.rejects(
        completeJob.handle({ jobDelivery: changedClaim, completedAt: new Date() }),
        InvalidDocumentIndexExecutionLeaseException,
      )
      assert.equal(
        (
          await knowledgeBaseDocumentModelRepository.findOneByOrFail({
            knowledgeBaseId: base.id,
            documentId: document.id,
          })
        ).activeDocumentIndexId,
        repeated.documentIndexId,
        'a worker for the superseded revision must not replace the latest ready index',
      )

      const sharedBases = await Promise.all(
        ['a', 'b'].map((suffix) =>
          knowledgeBaseModelRepository.save(
            knowledgeBaseModelRepository.create({
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
        sharedBases.map(async (sharedBase) => {
          const sharedBaseInput = {
            ...sharedInput,
            knowledgeBaseId: sharedBase.id,
            projectId: sharedBase.projectId,
            projectName: sharedBase.projectName,
          }
          const [first, repeated] = await Promise.all([
            requestIndex.handle(new DocumentIndexingRequestedEvent(sharedBaseInput)),
            requestIndex.handle(new DocumentIndexingRequestedEvent(sharedBaseInput)),
          ])
          assert.equal(repeated.jobId, first.jobId, 'concurrent requests for one knowledgeBaseDocument reuse its job')
          assert.equal(
            repeated.generation,
            first.generation,
            'concurrent requests retain the knowledgeBaseDocument generation',
          )
          assert.equal(repeated.documentIndexId, first.documentIndexId)

          return first
        }),
      )
      const sharedRequests = sharedRequestResults.map((result) => {
        if (result.status === 'rejected') assert.fail(result.reason)

        return result.value
      })
      sharedRequests.forEach((request) => {
        assert.ok(typeof request.jobId === 'string')
      })
      const sharedPlan = createMarkdownChunkPlan(sharedInput.content)
      const sharedVectors = sharedPlan.chunks.map((_, ordinal) =>
        Array.from({ length: config.embeddingDimensions }, (_, dimension) => (dimension === ordinal ? 1 : 0)),
      )
      assert.equal(sharedRequests[0]?.documentIndexId, sharedRequests[1]?.documentIndexId)
      const queuedSharedJobs = await jobModelRepository.findBy({
        knowledgeBaseId: In(sharedBases.map((sharedBase) => sharedBase.id)),
      })
      assert.equal(queuedSharedJobs.length, 2, 'both knowledge-base knowledgeBaseDocuments must own a queued job')
      assert.equal(
        await knowledgeBaseDocumentModelRepository.countBy({
          knowledgeBaseId: In(sharedBases.map((sharedBase) => sharedBase.id)),
        }),
        2,
        'concurrent requests create exactly one knowledgeBaseDocument per knowledge base',
      )
      const firstSharedClaim = await claimNext().handle()
      assert.ok(firstSharedClaim, 'one of the shared-index jobs must be claimed')
      assert.equal(await claimNext().handle(), null, 'the other job waits for the shared index build')
      const sharedPlanSavedAt = new Date()
      await new ReplaceIndexChunkUseCase(
        documentIndexPersistenceFixture.persistenceTransaction,
        new AuthorizeDocumentIndexChunkReplacementUseCase(
          new ReserveDocumentForIndexingUseCase(documentIndexPersistenceFixture.documentRepository),
          new ReserveKnowledgeBaseDocumentForIndexingUseCase(
            documentIndexPersistenceFixture.knowledgeBaseDocumentRepository,
          ),
          documentIndexPersistenceFixture.jobRepository,
          documentIndexPersistenceFixture.documentIndexRepository,
        ),
        documentIndexPersistenceFixture.chunkRepository,
        new ReplacePlannedDocumentRelationsUseCase(documentIndexPersistenceFixture.documentRelationRepository),
      ).execute({
        job: firstSharedClaim,
        markdownChunkPlan: sharedPlan,
        chunkEmbeddings: sharedVectors,
        now: sharedPlanSavedAt,
      })
      await completeJob.handle({ jobDelivery: firstSharedClaim, completedAt: new Date() })
      assert.equal(await claimNext().handle(), null, 'the remaining job activates the ready index without rebuilding')
      assert.equal(
        await chunkModelRepository.countBy({ documentIndexId: String(sharedRequests[0]?.documentIndexId) }),
        sharedPlan.chunks.length,
      )
      const activatedSharedKnowledgeBaseDocuments = await knowledgeBaseDocumentModelRepository.findBy({
        knowledgeBaseId: In(sharedBases.map((sharedBase) => sharedBase.id)),
        documentId: document.id,
      })
      assert.equal(activatedSharedKnowledgeBaseDocuments.length, 2)
      assert.ok(
        activatedSharedKnowledgeBaseDocuments.every(
          (knowledgeBaseDocument) => knowledgeBaseDocument.activeDocumentIndexId === sharedRequests[0]?.documentIndexId,
        ),
      )

      const readyReuseBase = await knowledgeBaseModelRepository.save(
        knowledgeBaseModelRepository.create({
          projectId: `shared-index-reuse-project-${fixtureId}`,
          projectName: `shared-index-reuse-${fixtureId}`,
        }),
      )
      const readyReuseRequest = await requestIndex.handle(
        new DocumentIndexingRequestedEvent({
          ...sharedInput,
          knowledgeBaseId: readyReuseBase.id,
          projectId: readyReuseBase.projectId,
          projectName: readyReuseBase.projectName,
        }),
      )
      assert.equal(readyReuseRequest.documentIndexId, sharedRequests[0]?.documentIndexId)
      assert.equal(readyReuseRequest.jobId, null)
      assert.equal(readyReuseRequest.reusedReadyIndex, true)
      const readyReuseKnowledgeBaseDocument = await knowledgeBaseDocumentModelRepository.findOneByOrFail({
        knowledgeBaseId: readyReuseBase.id,
        documentId: document.id,
      })
      assert.equal(readyReuseKnowledgeBaseDocument.activeDocumentIndexId, readyReuseRequest.documentIndexId)
      assert.equal(await jobModelRepository.countBy({ knowledgeBaseId: readyReuseBase.id, documentId: document.id }), 0)

      const sharedIndexId = String(sharedRequests[0]?.documentIndexId)
      const sharedIndex = await documentIndexModelRepository.findOneByOrFail({ id: sharedIndexId })
      sharedIndex.unreferencedSince = new Date(Date.now() - config.gcRetentionMs - 1000)
      await documentIndexModelRepository.save(sharedIndex)

      const lateReuseBase = await knowledgeBaseModelRepository.save(
        knowledgeBaseModelRepository.create({
          projectId: `late-shared-index-reuse-project-${fixtureId}`,
          projectName: `late-shared-index-reuse-${fixtureId}`,
        }),
      )
      const lateReuseRequest = await requestIndex.handle(
        new DocumentIndexingRequestedEvent({
          ...sharedInput,
          knowledgeBaseId: lateReuseBase.id,
          projectId: lateReuseBase.projectId,
          projectName: lateReuseBase.projectName,
        }),
      )
      assert.equal(lateReuseRequest.documentIndexId, sharedIndexId)
      assert.equal(lateReuseRequest.reusedReadyIndex, true)
      assert.equal(
        (await documentIndexModelRepository.findOneByOrFail({ id: sharedIndexId })).unreferencedSince,
        null,
        'reactivating an expired ready index must clear its unreferenced marker',
      )

      await prune.execute({
        projectId: sharedBases[0]!.projectId,
        knowledgeBaseId: sharedBases[0]!.id,
        documentIds: [],
      })
      assert.equal(await collectGarbage.handle(new DocumentGarbageCollectionRequestedEvent()), undefined)
      assert.ok(
        await documentIndexModelRepository.findOneBy({ id: sharedIndexId }),
        'GC must preserve an index still shared by another knowledgeBaseDocument',
      )
      assert.equal(await chunkModelRepository.countBy({ documentIndexId: sharedIndexId }), sharedPlan.chunks.length)

      await prune.execute({
        projectId: sharedBases[1]!.projectId,
        knowledgeBaseId: sharedBases[1]!.id,
        documentIds: [],
      })
      assert.equal(await collectGarbage.handle(new DocumentGarbageCollectionRequestedEvent()), undefined)
      assert.ok(
        await documentIndexModelRepository.findOneBy({ id: sharedIndexId }),
        'GC must preserve the index reused by remaining knowledgeBaseDocuments',
      )
      await prune.execute({ projectId: readyReuseBase.projectId, knowledgeBaseId: readyReuseBase.id, documentIds: [] })
      assert.equal(await collectGarbage.handle(new DocumentGarbageCollectionRequestedEvent()), undefined)
      assert.ok(
        await documentIndexModelRepository.findOneBy({ id: sharedIndexId }),
        'GC must preserve the index reused by a later knowledgeBaseDocument',
      )
      await prune.execute({ projectId: lateReuseBase.projectId, knowledgeBaseId: lateReuseBase.id, documentIds: [] })
      await documentIndexModelRepository.update(sharedIndexId, {
        unreferencedSince: new Date(Date.now() - config.gcRetentionMs - 1000),
      })
      assert.equal(await collectGarbage.handle(new DocumentGarbageCollectionRequestedEvent()), undefined)
      assert.equal(await documentIndexModelRepository.countBy({ id: sharedIndexId }), 0)
      assert.equal(await chunkModelRepository.countBy({ documentIndexId: sharedIndexId }), 0)

      const sourceRevision = await documentRevisionModelRepository.findOneByOrFail({ documentId: document.id })
      const orphanIndex = await documentIndexModelRepository.save(
        documentIndexModelRepository.create({
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
          status: DocumentIndexStatusEnum.READY,
          readyAt: new Date(),
          unreferencedSince: new Date(Date.now() - config.gcRetentionMs - 1000),
        }),
      )
      assert.equal(await collectGarbage.handle(new DocumentGarbageCollectionRequestedEvent()), undefined)
      assert.equal(await documentIndexModelRepository.countBy({ id: orphanIndex.id }), 0)

      const staleTargetInput = {
        ...input,
        sourceKey: `stale-prepared-target-${fixtureId}`,
        sourcePath: `stale-prepared-target-${fixtureId}.md`,
        content: 'Index preparation and enqueue must share one database transaction.',
      }
      const rollbackProjectId = `request-rollback-project-${fixtureId}`
      const rollbackKnowledgeBaseId = randomUUID()
      await assert.rejects(
        documentIndexPersistenceFixture.persistenceTransaction.run(async () => {
          await documentIndexPersistenceFixture.knowledgeBaseRepository.create({
            knowledgeBaseId: rollbackKnowledgeBaseId,
            projectId: rollbackProjectId,
            projectName: `request-rollback-${fixtureId}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          await requestIndex.handle(
            new DocumentIndexingRequestedEvent({
              ...staleTargetInput,
              knowledgeBaseId: rollbackKnowledgeBaseId,
              projectId: rollbackProjectId,
              projectName: `request-rollback-${fixtureId}`,
            }),
          )
          throw new Error('force transaction rollback after enqueue')
        }),
        /force transaction rollback after enqueue/,
      )
      assert.equal(await knowledgeBaseModelRepository.countBy({ projectId: rollbackProjectId }), 0)
      assert.equal(await documentModelRepository.countBy({ sourceKey: staleTargetInput.sourceKey }), 0)
      assert.equal(await knowledgeBaseDocumentModelRepository.countBy({ knowledgeBaseId: rollbackKnowledgeBaseId }), 0)
      assert.equal(await jobModelRepository.countBy({ knowledgeBaseId: rollbackKnowledgeBaseId }), 0)

      const concurrentBases = await Promise.all(
        ['a', 'b'].map((suffix) =>
          knowledgeBaseModelRepository.save(
            knowledgeBaseModelRepository.create({
              projectId: `new-source-project-${suffix}-${fixtureId}`,
              projectName: `new-source-${suffix}-${fixtureId}`,
            }),
          ),
        ),
      )
      const concurrentSourceKey = `new-source-${fixtureId}`
      const concurrentRequests = await Promise.all(
        concurrentBases.map((concurrentBase) =>
          requestIndex.handle(
            new DocumentIndexingRequestedEvent({
              ...input,
              knowledgeBaseId: concurrentBase.id,
              projectId: concurrentBase.projectId,
              projectName: concurrentBase.projectName,
              sourceKey: concurrentSourceKey,
            }),
          ),
        ),
      )
      assert.equal(await documentModelRepository.countBy({ sourceKey: concurrentSourceKey }), 1)
      assert.equal(concurrentRequests[0]?.documentId, concurrentRequests[1]?.documentId)
      assert.equal(
        await knowledgeBaseDocumentModelRepository.countBy({ documentId: concurrentRequests[0]!.documentId }),
        2,
        'concurrent requests from separate knowledge bases must both keep their knowledgeBaseDocument',
      )

      const gcOrphanDocument = await documentModelRepository.save(
        documentModelRepository.create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
          sourceKey: `gc-orphan-${fixtureId}`,
          sourcePath: `${fixtureId}/orphan.md`,
          currentTitle: 'GC orphan fixture',
          unreferencedSince: null,
        }),
      )
      const gcUnmarkedDocument = await documentModelRepository.save(
        documentModelRepository.create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
          sourceKey: `gc-unmarked-${fixtureId}`,
          sourcePath: `${fixtureId}/unmarked.md`,
          currentTitle: 'GC unmarked fixture',
          unreferencedSince: null,
        }),
      )
      const gcOrphanRevision = await documentRevisionModelRepository.save(
        documentRevisionModelRepository.create({
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
      await documentModelRepository.update({ id: document.id }, { unreferencedSince: expiredAt })
      const activeRevisionIds = new Set((await documentIndexModelRepository.find()).map((index) => index.revisionId))
      assert.equal(activeRevisionIds.has(gcOrphanRevisionId), false)

      await documentIndexPersistenceFixture.persistenceTransaction.run(async () => {
        const revisionCandidates =
          await documentIndexPersistenceFixture.documentRevisionRepository.findByCreatedAtLessThanOrEqual({
            cutoff: futureCutoff,
          })
        assert.ok(revisionCandidates.some((candidate) => candidate.id === gcOrphanRevisionId))
        const referencedRevisionCandidate = revisionCandidates.find((candidate) => activeRevisionIds.has(candidate.id))
        assert.ok(referencedRevisionCandidate, 'reference checks are deferred until after the candidate is locked')
        const lockedReferencedRevision =
          await documentIndexPersistenceFixture.documentRevisionRepository.lockByDocumentRevisionId({
            revisionId: referencedRevisionCandidate.id,
          })
        assert.ok(lockedReferencedRevision)
        assert.ok(
          (
            await documentIndexPersistenceFixture.documentIndexRepository.findByRevisionId({
              revisionId: lockedReferencedRevision.id,
            })
          ).length > 0,
        )

        assert.ok(
          await documentIndexPersistenceFixture.documentRepository.lockByDocumentId({ documentId: gcOrphanDocumentId }),
        )
        const lockedOrphanRevision =
          await documentIndexPersistenceFixture.documentRevisionRepository.lockByDocumentRevisionId({
            revisionId: gcOrphanRevisionId,
          })
        assert.ok(lockedOrphanRevision)
        assert.ok(lockedOrphanRevision.createdAt.epochMilliseconds <= futureCutoff.getTime())
        assert.deepEqual(
          await documentIndexPersistenceFixture.documentIndexRepository.findByRevisionId({
            revisionId: gcOrphanRevisionId,
          }),
          [],
        )
        await documentIndexPersistenceFixture.documentRevisionRepository.deleteByDocumentRevisionId({
          revisionId: gcOrphanRevisionId,
        })
        await documentIndexPersistenceFixture.documentRepository.updateUnreferencedSinceByDocumentIdAndUnreferencedSinceIsNull(
          {
            documentId: gcOrphanDocumentId,
            unreferencedSince: expiredAt,
          },
        )

        const documentCandidates =
          await documentIndexPersistenceFixture.documentRepository.findByUnreferencedSinceLessThanOrEqual({
            cutoff: futureCutoff,
          })
        assert.ok(documentCandidates.some((candidate) => candidate.id === gcOrphanDocumentId))
        assert.equal(
          documentCandidates.some((candidate) => candidate.id === gcUnmarkedDocument.id),
          false,
          'documents with no unreferenced timestamp are not GC candidates',
        )
        const referencedDocumentCandidate = documentCandidates.find((candidate) => candidate.id === document.id)
        assert.ok(
          referencedDocumentCandidate,
          'knowledgeBaseDocument reference checks are deferred until after the candidate is locked',
        )
        const lockedReferencedDocument = await documentIndexPersistenceFixture.documentRepository.lockByDocumentId({
          documentId: document.id,
        })
        assert.ok(lockedReferencedDocument)
        assert.ok(
          await documentIndexPersistenceFixture.knowledgeBaseDocumentRepository.findByDocumentId({
            documentId: document.id,
          }),
          'GC must retain documents still attached to a knowledge-base knowledgeBaseDocument',
        )

        const lockedOrphanDocument = await documentIndexPersistenceFixture.documentRepository.lockByDocumentId({
          documentId: gcOrphanDocumentId,
        })
        assert.ok(lockedOrphanDocument)
        assert.ok(lockedOrphanDocument.unreferencedSince)
        assert.ok(lockedOrphanDocument.unreferencedSince.epochMilliseconds <= futureCutoff.getTime())
        assert.deepEqual(
          {
            knowledgeBaseDocument:
              await documentIndexPersistenceFixture.knowledgeBaseDocumentRepository.findByDocumentId({
                documentId: gcOrphanDocumentId,
              }),
            revision:
              await documentIndexPersistenceFixture.documentRevisionRepository.findByDocumentIdOrderByCreatedAtDesc({
                documentId: gcOrphanDocumentId,
              }),
            indexes: await documentIndexPersistenceFixture.documentIndexRepository.findByDocumentId({
              documentId: gcOrphanDocumentId,
            }),
            jobCount: await documentIndexPersistenceFixture.jobRepository.countDocumentExecutions({
              documentId: gcOrphanDocumentId,
            }),
            failedJobCount: await documentIndexPersistenceFixture.failedJobRepository.countDocumentFailures({
              documentId: gcOrphanDocumentId,
            }),
            relation: await documentIndexPersistenceFixture.documentRelationRepository.findByTargetDocumentId({
              documentId: gcOrphanDocumentId,
            }),
          },
          {
            knowledgeBaseDocument: null,
            revision: null,
            indexes: [],
            jobCount: 0,
            failedJobCount: 0,
            relation: null,
          },
        )
        await documentIndexPersistenceFixture.documentRepository.deleteByDocumentId({ documentId: gcOrphanDocumentId })
      })

      assert.equal(await documentRevisionModelRepository.findOneBy({ id: gcOrphanRevisionId }), null)
      assert.equal(await documentModelRepository.findOneBy({ id: gcOrphanDocumentId }), null)

      const raceSourceKey = `gc-request-race-${fixtureId}`
      const raceSource = await documentModelRepository.save(
        documentModelRepository.create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
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
      const collection = documentIndexPersistenceFixture.persistenceTransaction.run(async () => {
        const locked = await documentIndexPersistenceFixture.documentRepository.lockByDocumentId({
          documentId: raceSource.id,
        })
        assert.ok(locked)
        assert.deepEqual(
          {
            knowledgeBaseDocument:
              await documentIndexPersistenceFixture.knowledgeBaseDocumentRepository.findByDocumentId({
                documentId: raceSource.id,
              }),
            revision:
              await documentIndexPersistenceFixture.documentRevisionRepository.findByDocumentIdOrderByCreatedAtDesc({
                documentId: raceSource.id,
              }),
            indexes: await documentIndexPersistenceFixture.documentIndexRepository.findByDocumentId({
              documentId: raceSource.id,
            }),
            jobCount: await documentIndexPersistenceFixture.jobRepository.countDocumentExecutions({
              documentId: raceSource.id,
            }),
            failedJobCount: await documentIndexPersistenceFixture.failedJobRepository.countDocumentFailures({
              documentId: raceSource.id,
            }),
            relation: await documentIndexPersistenceFixture.documentRelationRepository.findByTargetDocumentId({
              documentId: raceSource.id,
            }),
          },
          {
            knowledgeBaseDocument: null,
            revision: null,
            indexes: [],
            jobCount: 0,
            failedJobCount: 0,
            relation: null,
          },
        )
        signalDocumentLocked()
        await allowGarbageCollection
        await documentIndexPersistenceFixture.documentRepository.deleteByDocumentId({ documentId: raceSource.id })
      })
      await documentLocked
      let requestSettled = false
      const concurrentRequest = requestIndex
        .handle(
          new DocumentIndexingRequestedEvent({
            ...input,
            sourceKey: raceSourceKey,
            sourcePath: `${fixtureId}/race.md`,
          }),
        )
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
      assert.equal(await documentModelRepository.findOneBy({ id: raceSource.id }), null)
      const recoveredSource = await documentModelRepository.findOneByOrFail({
        sourceType: DocumentSourceTypeEnum.REPOSITORY,
        sourceKey: raceSourceKey,
        sourcePath: `${fixtureId}/race.md`,
      })
      assert.equal(raceRequestResult.documentId, recoveredSource.id)
      assert.equal(
        recoveredSource.unreferencedSince,
        null,
        'a successful request must clear the expired retention marker',
      )
      assert.ok(
        await knowledgeBaseDocumentModelRepository.findOneBy({
          knowledgeBaseId: base.id,
          documentId: recoveredSource.id,
        }),
      )
    } finally {
      await cleanup()
    }
  },
)
