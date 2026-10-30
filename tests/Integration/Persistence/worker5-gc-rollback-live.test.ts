import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { test } from 'node:test'

import { DataSource } from 'typeorm'

import { createRetrievalReadonlyDataSourceOptions } from '../../../src/Bootstrap/Nest/Providers/retrieval-readonly-data-source.options.ts'
import { createDataSource } from '../../../src/Bootstrap/Persistence/TypeORM/DataSource.ts'
import { CollectIndexChunkGarbageCommandHandler } from '../../../src/Chunks/Application/Commands/collect-index-chunk-garbage.command.handler.ts'
import { ChunkRepository } from '../../../src/Chunks/Infrastructure/Persistence/TypeORM/Repositories/chunk.repository.ts'
import { CollectDocumentIndexFailureGarbageCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/collect-document-index-failure-garbage.command.handler.ts'
import { CollectDocumentIndexGarbageCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/collect-document-index-garbage.command.handler.ts'
import { CollectDocumentIndexGarbageCommandHandlerContract } from '../../../src/DocumentIndexes/Application/Contracts/collect-document-index-garbage.command.handler.contract.ts'
import type { CollectDocumentIndexGarbageDTO } from '../../../src/DocumentIndexes/Application/DTOs/document-index-garbage.dto.ts'
import { InspectDocumentIndexExecutionRetentionQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/inspect-document-index-execution-retention.query.handler.ts'
import { InspectDocumentIndexRetentionQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/inspect-document-index-retention.query.handler.ts'
import { PlanDocumentIndexGarbageQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/plan-document-index-garbage.query.handler.ts'
import type { DocumentIndex } from '../../../src/DocumentIndexes/Domain/Entities/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { DocumentIndexModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index.model.ts'
import { DocumentIndexRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/document-index.repository.ts'
import { FailedJobRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/job.repository.ts'
import { CollectDocumentRelationGarbageCommandHandler } from '../../../src/DocumentRelations/Application/Commands/collect-document-relation-garbage.command.handler.ts'
import { InspectDocumentRelationRetentionQueryHandler } from '../../../src/DocumentRelations/Application/Queries/inspect-document-relation-retention.query.handler.ts'
import { PlanDocumentRelationGarbageQueryHandler } from '../../../src/DocumentRelations/Application/Queries/plan-document-relation-garbage.query.handler.ts'
import { DocumentRelationRepository } from '../../../src/DocumentRelations/Infrastructure/Persistence/TypeORM/Repositories/document-relation.repository.ts'
import { CollectDocumentRevisionGarbageCommandHandler } from '../../../src/DocumentRevisions/Application/Commands/collect-document-revision-garbage.command.handler.ts'
import { CollectDocumentRevisionGarbageCommandHandlerContract } from '../../../src/DocumentRevisions/Application/Contracts/collect-document-revision-garbage.command.handler.contract.ts'
import type { CollectDocumentRevisionGarbageDTO } from '../../../src/DocumentRevisions/Application/DTOs/document-revision-garbage.dto.ts'
import { InspectDocumentRevisionRetentionQueryHandler } from '../../../src/DocumentRevisions/Application/Queries/inspect-document-revision-retention.query.handler.ts'
import { PlanDocumentRevisionGarbageQueryHandler } from '../../../src/DocumentRevisions/Application/Queries/plan-document-revision-garbage.query.handler.ts'
import type { DocumentRevision } from '../../../src/DocumentRevisions/Domain/Entities/document-revision.ts'
import { DocumentRevisionModel } from '../../../src/DocumentRevisions/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { DocumentRevisionRepository } from '../../../src/DocumentRevisions/Infrastructure/Persistence/TypeORM/Repositories/document-revision.repository.ts'
import { LockDocumentRetentionParentsCommandHandler } from '../../../src/Documents/Application/Commands/lock-document-retention-parents.command.handler.ts'
import { DocumentGarbageCollectionRequestedEvent } from '../../../src/Documents/Application/Events/document-garbage-collection-requested.event.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../src/Documents/Application/Listeners/document-garbage-collection-requested.listener.ts'
import { InspectDocumentRetentionQueryHandler } from '../../../src/Documents/Application/Queries/inspect-document-retention.query.handler.ts'
import { DocumentSourceTypeEnum } from '../../../src/Documents/Domain/Enums/document-source-type.enum.ts'
import { DocumentModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document.model.ts'
import { DocumentRepository } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Repositories/document.repository.ts'
import { InspectKnowledgeBaseDocumentRetentionQueryHandler } from '../../../src/KnowledgeBaseDocuments/Application/Queries/inspect-knowledge-base-document-retention.query.handler.ts'
import { KnowledgeBaseDocumentRepository } from '../../../src/KnowledgeBaseDocuments/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base-document.repository.ts'
import { KnowledgeBaseRepository } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base.repository.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
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

    const baseIndexCollector = new CollectDocumentIndexGarbageCommandHandler(
      fixture.documentIndexRepository,
      fixture.jobRepository,
      fixture.failedJobRepository,
      new InspectKnowledgeBaseDocumentRetentionQueryHandler(fixture.knowledgeBaseDocumentRepository),
      new CollectDocumentRelationGarbageCommandHandler(fixture.documentRelationRepository),
      new CollectIndexChunkGarbageCommandHandler(fixture.chunkRepository),
    )
    let indexCollectionCompleted = false
    const trackingIndexCollector = new (class extends CollectDocumentIndexGarbageCommandHandlerContract {
      override async execute(collectDocumentIndexGarbageDTO: CollectDocumentIndexGarbageDTO): Promise<DocumentIndex[]> {
        const collected = await baseIndexCollector.execute(collectDocumentIndexGarbageDTO)
        indexCollectionCompleted = collected.some((candidate) => candidate.id === index.id)

        return collected
      }
    })()

    const baseRevisionCollector = new CollectDocumentRevisionGarbageCommandHandler(
      fixture.documentRevisionRepository,
      new InspectDocumentIndexRetentionQueryHandler(fixture.documentIndexRepository),
    )
    let injectFault = true
    const faultingRevisionCollector = new (class extends CollectDocumentRevisionGarbageCommandHandlerContract {
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
      new PlanDocumentIndexGarbageQueryHandler(fixture.documentIndexRepository, fixture.failedJobRepository),
      trackingIndexCollector,
      new PlanDocumentRevisionGarbageQueryHandler(fixture.documentRevisionRepository),
      faultingRevisionCollector,
      new PlanDocumentRelationGarbageQueryHandler(fixture.documentRelationRepository),
      new LockDocumentRetentionParentsCommandHandler(fixture.documentRepository),
      new InspectDocumentRetentionQueryHandler(
        new InspectKnowledgeBaseDocumentRetentionQueryHandler(fixture.knowledgeBaseDocumentRepository),
        new InspectDocumentRevisionRetentionQueryHandler(fixture.documentRevisionRepository),
        new InspectDocumentIndexRetentionQueryHandler(fixture.documentIndexRepository),
        new InspectDocumentRelationRetentionQueryHandler(fixture.documentRelationRepository),
        fixture.documentRepository,
        new InspectDocumentIndexExecutionRetentionQueryHandler(fixture.jobRepository, fixture.failedJobRepository),
      ),
      { gcRetentionMs: retentionMs },
      new CollectDocumentIndexFailureGarbageCommandHandler(fixture.jobRepository, fixture.failedJobRepository),
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
