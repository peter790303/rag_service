import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { test } from 'node:test'

import { DataSource } from 'typeorm'

import { createDataSource } from '../../../database/data-source.ts'
import { CollectIndexChunkGarbageUseCase } from '../../../src/Application/Chunks/UseCases/collect-index-chunk-garbage.use-case.ts'
import { CollectDocumentIndexGarbageUseCaseContract } from '../../../src/Application/DocumentIndexes/Contracts/collect-document-index-garbage.use-case.contract.ts'
import type { CollectDocumentIndexGarbageDTO } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-index-garbage.dto.ts'
import { CollectDocumentIndexGarbageUseCase } from '../../../src/Application/DocumentIndexes/UseCases/collect-document-index-garbage.use-case.ts'
import { InspectDocumentIndexRetentionUseCase } from '../../../src/Application/DocumentIndexes/UseCases/inspect-document-index-retention.use-case.ts'
import { PlanDocumentIndexGarbageUseCase } from '../../../src/Application/DocumentIndexes/UseCases/plan-document-index-garbage.use-case.ts'
import { CollectDocumentRelationGarbageUseCase } from '../../../src/Application/DocumentRelations/UseCases/collect-document-relation-garbage.use-case.ts'
import { InspectDocumentRelationRetentionUseCase } from '../../../src/Application/DocumentRelations/UseCases/inspect-document-relation-retention.use-case.ts'
import { PlanDocumentRelationGarbageUseCase } from '../../../src/Application/DocumentRelations/UseCases/plan-document-relation-garbage.use-case.ts'
import { CollectDocumentRevisionGarbageUseCaseContract } from '../../../src/Application/DocumentRevisions/Contracts/collect-document-revision-garbage.use-case.contract.ts'
import type { CollectDocumentRevisionGarbageDTO } from '../../../src/Application/DocumentRevisions/DataTransferObjects/document-revision-garbage.dto.ts'
import { CollectDocumentRevisionGarbageUseCase } from '../../../src/Application/DocumentRevisions/UseCases/collect-document-revision-garbage.use-case.ts'
import { InspectDocumentRevisionRetentionUseCase } from '../../../src/Application/DocumentRevisions/UseCases/inspect-document-revision-retention.use-case.ts'
import { PlanDocumentRevisionGarbageUseCase } from '../../../src/Application/DocumentRevisions/UseCases/plan-document-revision-garbage.use-case.ts'
import { DocumentGarbageCollectionRequestedEvent } from '../../../src/Application/Documents/Events/document-garbage-collection-requested.event.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../src/Application/Documents/Listeners/document-garbage-collection-requested.listener.ts'
import { InspectDocumentRetentionUseCase } from '../../../src/Application/Documents/UseCases/inspect-document-retention.use-case.ts'
import { LockDocumentRetentionParentsUseCase } from '../../../src/Application/Documents/UseCases/lock-document-retention-parents.use-case.ts'
import { InspectKnowledgeBaseDocumentRetentionUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/inspect-knowledge-base-document-retention.use-case.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import type { DocumentIndex } from '../../../src/Domain/DocumentIndex/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import type { DocumentRevision } from '../../../src/Domain/DocumentRevision/document-revision.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
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
import { createRetrievalReadonlyDataSourceOptions } from '../../../src/Infrastructure/Providers/retrieval-readonly-data-source.options.ts'
import { DocumentIndexPersistenceFixture } from '../../Support/document-index-persistence.fixture.ts'

const targetSchema = 'codex_live_20261019_w5_gc'
const evidencePath = process.env.RAG_TODO_GC_EVIDENCE_PATH
const injectedFault = 'worker5 deterministic fault after index collection'
const tableNames = [
  'documents',
  'document_revisions',
  'document_indexes',
  'document_relations',
  'chunks',
  'knowledge_base_documents',
  'jobs',
  'failed_jobs',
] as const

type RowCounts = Record<(typeof tableNames)[number], number>

test('GC rollback restores collected indexes and a retry collects only in the dedicated schema', async (context) => {
  if (!process.env.RAG_DATABASE_URL) {
    context.skip('RAG_DATABASE_URL is required for the isolated live GC check')

    return
  }

  const runId = randomUUID()
  const dataSource = createDataSource(targetSchema)
  const persistenceDataSourceOptions = dataSource.options
  assert.equal(persistenceDataSourceOptions.type, 'postgres')
  assert.ok(persistenceDataSourceOptions.url)
  assert.ok(persistenceDataSourceOptions.entities)

  const retrievalDataSource = new DataSource(
    createRetrievalReadonlyDataSourceOptions({
      url: persistenceDataSourceOptions.url,
      schema: targetSchema,
      entities: persistenceDataSourceOptions.entities,
    }),
  )

  const evidence: Record<string, unknown> = {
    checkedAt: new Date().toISOString(),
    runId,
    targetSchema,
    database: 'agent_teams_rag',
    preExistingSchema: false,
    vectorExtensionPresent: false,
    schemaCreatedByHarness: false,
    faultMarker: injectedFault,
    faultReachedAfterIndexCollection: false,
    seed: null,
    countsBeforeFault: null,
    countsAfterFault: null,
    countsAfterSuccessfulRetry: null,
    cleanup: { attempted: false, completed: false, schemaAbsentAfter: false },
  }
  let schemaCreatedByHarness = false
  let failure: unknown

  const readCounts = async (source: DataSource): Promise<RowCounts> => {
    const pairs = await Promise.all(
      tableNames.map(async (tableName) => {
        const count = await source.getRepository(tableName).count()

        return [tableName, count] as const
      }),
    )

    return Object.fromEntries(pairs) as RowCounts
  }

  try {
    await dataSource.initialize()
    const preflightRunner = dataSource.createQueryRunner()
    try {
      const targetAlreadyExists = await preflightRunner.hasSchema(targetSchema)
      evidence.preExistingSchema = targetAlreadyExists
      assert.equal(targetAlreadyExists, false, `refusing to use pre-existing schema ${targetSchema}`)

      const extensionRows = (await preflightRunner.query(
        "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS present",
      )) as Array<{ present: boolean }>
      const vectorExtensionPresent = extensionRows.at(0)?.present === true
      evidence.vectorExtensionPresent = vectorExtensionPresent
      assert.equal(vectorExtensionPresent, true, 'vector extension must already exist before isolated migrations')

      await preflightRunner.createSchema(targetSchema, true)
      schemaCreatedByHarness = true
      evidence.schemaCreatedByHarness = true
    } finally {
      await preflightRunner.release()
    }

    await dataSource.runMigrations()
    await retrievalDataSource.initialize()

    const persistenceTransaction = new PersistenceTransaction(dataSource)
    const documentRepository = new DocumentRepository(persistenceTransaction)
    const documentIndexRepository = new DocumentIndexRepository(persistenceTransaction)
    const documentRevisionRepository = new DocumentRevisionRepository(persistenceTransaction)
    const jobRepository = new JobRepository(persistenceTransaction)
    const failedJobRepository = new FailedJobRepository(persistenceTransaction)
    const knowledgeBaseDocumentRepository = new KnowledgeBaseDocumentRepository(persistenceTransaction)
    const knowledgeBaseRepository = new KnowledgeBaseRepository(persistenceTransaction)
    const chunkRepository = new ChunkRepository(persistenceTransaction, retrievalDataSource)
    const relationRepository = new DocumentRelationRepository(persistenceTransaction)
    const fixture = new DocumentIndexPersistenceFixture(
      persistenceTransaction,
      jobRepository,
      knowledgeBaseDocumentRepository,
      documentIndexRepository,
      knowledgeBaseRepository,
      documentRepository,
      documentRevisionRepository,
      failedJobRepository,
      chunkRepository,
      relationRepository,
    )

    const key = `worker5-gc-${runId}`
    const document = await dataSource.getRepository(DocumentModel).save(
      dataSource.getRepository(DocumentModel).create({
        sourceType: DocumentSourceTypeEnum.REPOSITORY,
        sourceKey: key,
        sourcePath: `acceptance/${key}.md`,
        currentTitle: 'Worker 5 GC rollback fixture',
        unreferencedSince: null,
      }),
    )
    const revisionRepository = dataSource.getRepository(DocumentRevisionModel)
    const revision = await revisionRepository.save(
      revisionRepository.create({
        documentId: document.id,
        contentSha256: 'c'.repeat(64),
        title: 'GC rollback fixture',
        content: '# GC rollback fixture',
      }),
    )
    const oldDate = new Date('2020-01-01T00:00:00.000Z')
    await revisionRepository.update({ id: revision.id }, { createdAt: oldDate })
    const indexRepository = dataSource.getRepository(DocumentIndexModel)
    const index = await indexRepository.save(
      indexRepository.create({
        documentId: document.id,
        revisionId: revision.id,
        pipelineHash: 'd'.repeat(64),
        chunkingModel: 'fixture',
        chunkingProfile: 'fixture',
        embeddingModel: 'fixture',
        embeddingDimensions: 384,
        embeddingProfile: 'fixture',
        lexicalProfile: 'fixture',
        relationProfile: 'fixture',
        status: DocumentIndexStatusEnum.READY,
        readyAt: oldDate,
        unreferencedSince: oldDate,
      }),
    )
    const seed = { documentId: document.id, revisionId: revision.id, documentIndexId: index.id }
    evidence.seed = seed
    const beforeFault = await readCounts(dataSource)
    evidence.countsBeforeFault = beforeFault

    const baseIndexCollector = new CollectDocumentIndexGarbageUseCase(
      fixture.documentIndexRepository,
      fixture.jobRepository,
      fixture.failedJobRepository,
      new InspectKnowledgeBaseDocumentRetentionUseCase(fixture.knowledgeBaseDocumentRepository),
      new CollectDocumentRelationGarbageUseCase(fixture.documentRelationRepository),
      new CollectIndexChunkGarbageUseCase(fixture.chunkRepository),
    )
    let indexCollectionCompleted = false
    const trackingIndexCollector = new (class extends CollectDocumentIndexGarbageUseCaseContract {
      override async execute(collectDocumentIndexGarbageDTO: CollectDocumentIndexGarbageDTO): Promise<DocumentIndex[]> {
        const collected = await baseIndexCollector.execute(collectDocumentIndexGarbageDTO)
        indexCollectionCompleted = collected.some((candidate) => candidate.id === index.id)

        return collected
      }
    })()

    const baseRevisionCollector = new CollectDocumentRevisionGarbageUseCase(
      fixture.documentRevisionRepository,
      new InspectDocumentIndexRetentionUseCase(fixture.documentIndexRepository),
    )
    let injectFault = true
    const faultingRevisionCollector = new (class extends CollectDocumentRevisionGarbageUseCaseContract {
      override async execute(
        collectDocumentRevisionGarbageDTO: CollectDocumentRevisionGarbageDTO,
      ): Promise<DocumentRevision[]> {
        if (injectFault) {
          injectFault = false
          evidence.faultReachedAfterIndexCollection = indexCollectionCompleted

          if (!indexCollectionCompleted) throw new Error('GC fault guard: index was not collected first')

          throw new Error(injectedFault)
        }

        return baseRevisionCollector.execute(collectDocumentRevisionGarbageDTO)
      }
    })()

    const retentionMs = 24 * 60 * 60 * 1000
    const listener = new DocumentGarbageCollectionRequestedListener(
      fixture.persistenceTransaction,
      fixture.documentRepository,
      new PlanDocumentIndexGarbageUseCase(fixture.documentIndexRepository),
      trackingIndexCollector,
      new PlanDocumentRevisionGarbageUseCase(fixture.documentRevisionRepository),
      faultingRevisionCollector,
      new PlanDocumentRelationGarbageUseCase(fixture.documentRelationRepository),
      new LockDocumentRetentionParentsUseCase(fixture.documentRepository),
      new InspectDocumentRetentionUseCase(
        new InspectKnowledgeBaseDocumentRetentionUseCase(fixture.knowledgeBaseDocumentRepository),
        new InspectDocumentRevisionRetentionUseCase(fixture.documentRevisionRepository),
        new InspectDocumentIndexRetentionUseCase(fixture.documentIndexRepository),
        new InspectDocumentRelationRetentionUseCase(fixture.documentRelationRepository),
        fixture.documentRepository,
        fixture.jobRepository,
        fixture.failedJobRepository,
      ),
      { gcRetentionMs: retentionMs },
      fixture.jobRepository,
      fixture.failedJobRepository,
    )

    await assert.rejects(
      listener.handle(new DocumentGarbageCollectionRequestedEvent(new Date())),
      new RegExp(injectedFault),
    )
    assert.equal(evidence.faultReachedAfterIndexCollection, true)
    assert.ok(await indexRepository.findOneBy({ id: index.id }), 'index delete is rolled back')
    assert.ok(await revisionRepository.findOneBy({ id: revision.id }), 'revision remains after rollback')
    const afterFault = await readCounts(dataSource)
    evidence.countsAfterFault = afterFault
    assert.deepEqual(afterFault, beforeFault, 'all target-schema rows are restored after transaction rollback')

    await listener.handle(new DocumentGarbageCollectionRequestedEvent(new Date()))
    assert.equal(await indexRepository.findOneBy({ id: index.id }), null)
    assert.equal(await revisionRepository.findOneBy({ id: revision.id }), null)
    const afterRetry = await readCounts(dataSource)
    evidence.countsAfterSuccessfulRetry = afterRetry
    assert.equal(afterRetry.documents, 1)
    assert.equal(afterRetry.document_indexes, 0)
    assert.equal(afterRetry.document_revisions, 0)
  } catch (error) {
    failure = error
  } finally {
    evidence.cleanup = { attempted: true, completed: false, schemaAbsentAfter: false }
    try {
      if (retrievalDataSource.isInitialized) await retrievalDataSource.destroy()

      if (dataSource.isInitialized) {
        if (schemaCreatedByHarness) {
          const cleanupRunner = dataSource.createQueryRunner()
          try {
            await cleanupRunner.dropSchema(targetSchema, true, true)
            schemaCreatedByHarness = false
          } finally {
            await cleanupRunner.release()
          }
        }

        await dataSource.destroy()
      }

      const verifyDataSource = createDataSource()
      await verifyDataSource.initialize()
      try {
        const verifyRunner = verifyDataSource.createQueryRunner()
        try {
          const targetStillExists = await verifyRunner.hasSchema(targetSchema)
          evidence.cleanup = {
            attempted: true,
            completed: !targetStillExists,
            schemaAbsentAfter: !targetStillExists,
          }
          assert.equal(targetStillExists, false, 'dedicated test schema is absent after cleanup')
        } finally {
          await verifyRunner.release()
        }
      } finally {
        await verifyDataSource.destroy()
      }
    } catch (cleanupError) {
      failure = failure ? new AggregateError([failure, cleanupError], 'GC live check and cleanup failed') : cleanupError
    }

    evidence.completedAt = new Date().toISOString()
    evidence.successful = failure === undefined
    evidence.error = failure instanceof Error ? failure.message : failure === undefined ? null : String(failure)

    if (evidencePath) {
      try {
        await mkdir(dirname(evidencePath), { recursive: true })
        await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
      } catch (evidenceError) {
        failure =
          failure === undefined
            ? evidenceError
            : new AggregateError([failure, evidenceError], 'GC live check, cleanup, and evidence write failed')
      }
    }
  }

  if (failure !== undefined) throw failure
})
