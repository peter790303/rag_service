import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { concatMap, filter, firstValueFrom, from, interval, take, throwError, timeout } from 'rxjs'
import { EntitySchema, type DataSource, type QueryRunner } from 'typeorm'
import { ConnectionMetadataBuilder } from 'typeorm/connection/ConnectionMetadataBuilder.js'

import { CollectIndexChunkGarbageCommandHandler } from '../../../src/Chunks/Application/Commands/collect-index-chunk-garbage.command.handler.ts'
import { ChunkRepository } from '../../../src/Chunks/Infrastructure/Persistence/TypeORM/Repositories/chunk.repository.ts'
import { CollectDocumentIndexGarbageCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/collect-document-index-garbage.command.handler.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/DocumentIndexes/Application/Enums/document-index-execution-stage.enum.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/DocumentIndexes/Application/Helpers/document-index-execution-lifecycle.helper.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { JobExecutionVerificationAdapter } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Mappers/job-execution-verification.adapter.ts'
import { DocumentIndexModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index.model.ts'
import { FailedJobModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/failed-job.model.ts'
import { JobModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/job.model.ts'
import { DocumentIndexRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/document-index.repository.ts'
import { FailedJobRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/job.repository.ts'
import { CollectDocumentRelationGarbageCommandHandler } from '../../../src/DocumentRelations/Application/Commands/collect-document-relation-garbage.command.handler.ts'
import { DocumentRelationRepository } from '../../../src/DocumentRelations/Infrastructure/Persistence/TypeORM/Repositories/document-relation.repository.ts'
import { DocumentRevisionModel } from '../../../src/DocumentRevisions/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { DocumentSourceTypeEnum } from '../../../src/Documents/Domain/Enums/document-source-type.enum.ts'
import { DocumentModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document.model.ts'
import { InspectKnowledgeBaseDocumentRetentionQueryHandler } from '../../../src/KnowledgeBaseDocuments/Application/Queries/inspect-knowledge-base-document-retention.query.handler.ts'
import { KnowledgeBaseDocumentModel } from '../../../src/KnowledgeBaseDocuments/Infrastructure/Persistence/TypeORM/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseDocumentRepository } from '../../../src/KnowledgeBaseDocuments/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base-document.repository.ts'
import { KnowledgeBaseModel } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

type PgStatActivityRow = {
  pid: number
  waitEventType: string | null
  waitEvent: string | null
}

const pgStatActivitySchema = new EntitySchema<PgStatActivityRow>({
  name: 'DocumentIndexGcRacePgStatActivity',
  schema: 'pg_catalog',
  tableName: 'pg_stat_activity',
  synchronize: false,
  columns: {
    pid: { type: 'integer', primary: true },
    waitEventType: { name: 'wait_event_type', type: 'text', nullable: true },
    waitEvent: { name: 'wait_event', type: 'text', nullable: true },
  },
})

const registerPgStatActivitySchema = async (dataSource: DataSource): Promise<void> => {
  if (dataSource.hasMetadata(pgStatActivitySchema)) return

  const [metadata] = await new ConnectionMetadataBuilder(dataSource).buildEntityMetadatas([pgStatActivitySchema])
  assert.ok(metadata, 'TypeORM builds the read-only pg_stat_activity mapping')
  dataSource.entityMetadatas.push(metadata)
  dataSource.entityMetadatasMap.set(metadata.target, metadata)
}

const readLockWait = async (dataSource: DataSource, pid: number): Promise<PgStatActivityRow | null> =>
  dataSource.getRepository(pgStatActivitySchema).findOneBy({ pid, waitEventType: 'Lock' })

const waitForLockWait = async (dataSource: DataSource, pid: number, label: string): Promise<PgStatActivityRow> =>
  firstValueFrom(
    interval(20).pipe(
      concatMap(() => from(readLockWait(dataSource, pid))),
      filter((activity): activity is PgStatActivityRow => activity !== null),
      take(1),
      timeout({ first: 10_000, with: () => throwError(() => new Error(label)) }),
    ),
  )

const backendPid = (connection: unknown): number => {
  const processID = (connection as { processID?: number }).processID

  if (typeof processID !== 'number') throw new Error('PostgreSQL connection exposes its backend process id')

  return processID
}

const releaseRunner = async (queryRunner: QueryRunner | null): Promise<void> => {
  if (queryRunner === null || queryRunner.isReleased) return

  if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()

  await queryRunner.release()
}

const createFixture = async (dataSource: DataSource, prefix: string) => {
  const key = randomUUID()
  const knowledgeBase = {
    id: randomUUID(),
    projectId: `${prefix}-${key}`,
    projectName: `${prefix}-${key}`,
  } satisfies Partial<KnowledgeBaseModel>
  await dataSource.getRepository(KnowledgeBaseModel).insert(knowledgeBase)
  const document = {
    id: randomUUID(),
    sourceType: DocumentSourceTypeEnum.REPOSITORY,
    sourceKey: key,
    sourcePath: `docs/${key}.md`,
    unreferencedSince: null,
  } satisfies Partial<DocumentModel>
  await dataSource.getRepository(DocumentModel).insert(document)
  const revision = {
    id: randomUUID(),
    documentId: document.id,
    contentSha256: 'a'.repeat(64),
    title: 'Index GC lock race',
    content: '# Index GC lock race',
  } satisfies Partial<DocumentRevisionModel>
  await dataSource.getRepository(DocumentRevisionModel).insert(revision)
  const unreferencedSince = new Date('2020-01-01T00:00:00.000Z')
  const documentIndex = {
    id: randomUUID(),
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
    status: DocumentIndexStatusEnum.READY,
    readyAt: new Date(),
    unreferencedSince,
  } satisfies Partial<DocumentIndexModel>
  await dataSource.getRepository(DocumentIndexModel).insert(documentIndex)

  return { document, documentIndex, knowledgeBase, unreferencedSince }
}

const createCollector = (persistenceTransaction: PersistenceTransaction, retrievalDataSource: DataSource) =>
  new CollectDocumentIndexGarbageCommandHandler(
    new DocumentIndexRepository(persistenceTransaction),
    new JobRepository(persistenceTransaction),
    new FailedJobRepository(persistenceTransaction),
    new InspectKnowledgeBaseDocumentRetentionQueryHandler(new KnowledgeBaseDocumentRepository(persistenceTransaction)),
    new CollectDocumentRelationGarbageCommandHandler(new DocumentRelationRepository(persistenceTransaction)),
    new CollectIndexChunkGarbageCommandHandler(new ChunkRepository(persistenceTransaction, retrievalDataSource)),
  )

const lockScope = (documentId: string, retentionCutoff: Date) => ({
  lockedDocumentIds: [documentId],
  retentionCutoff,
})

test(
  'index GC rechecks a knowledge-base reference committed while both writers wait for the index lock',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)
    let holderRunner: QueryRunner | null = null
    let writerRunner: QueryRunner | null = null
    let gcRunner: QueryRunner | null = null

    try {
      await registerPgStatActivitySchema(dataSource)
      const fixture = await createFixture(dataSource, 'gc-reference-lock-race')
      const indexRepository = new DocumentIndexRepository(persistenceTransaction)
      const candidate = await indexRepository.findByDocumentIndexId({ documentIndexId: fixture.documentIndex.id })
      assert.ok(candidate)

      holderRunner = dataSource.createQueryRunner()
      await holderRunner.connect()
      await holderRunner.startTransaction()
      assert.ok(
        await persistenceTransaction.bind(holderRunner.manager, () =>
          indexRepository.lockByDocumentIndexId({ documentIndexId: fixture.documentIndex.id }),
        ),
      )

      writerRunner = dataSource.createQueryRunner()
      const writerConnection = await writerRunner.connect()
      await writerRunner.startTransaction()
      const writerPid = backendPid(writerConnection)
      const associationSave = writerRunner.manager.getRepository(KnowledgeBaseDocumentModel).insert({
        knowledgeBaseId: fixture.knowledgeBase.id,
        documentId: fixture.document.id,
        activeDocumentIndexId: fixture.documentIndex.id,
        requestedGeneration: '1',
        isEntry: false,
        alwaysIncludeFullContent: false,
      })
      await waitForLockWait(dataSource, writerPid, 'reference insert never entered a PostgreSQL lock wait')

      gcRunner = dataSource.createQueryRunner()
      const gcConnection = await gcRunner.connect()
      await gcRunner.startTransaction()
      const gcPid = backendPid(gcConnection)
      const gcUseCase = createCollector(persistenceTransaction, retrievalDataSource)
      const gcResultPromise = persistenceTransaction.bind(gcRunner.manager, () =>
        gcUseCase.execute({
          scope: lockScope(fixture.document.id, new Date('2024-01-01T00:00:00.000Z')),
          candidates: [candidate],
        }),
      )
      await waitForLockWait(dataSource, gcPid, 'index GC never entered the index row lock wait')

      await holderRunner.commitTransaction()
      await associationSave
      assert.ok(await readLockWait(dataSource, gcPid), 'GC remains blocked while the reference transaction is open')
      await writerRunner.commitTransaction()

      assert.deepEqual(await gcResultPromise, [], 'GC sees the committed reference after acquiring the index lock')
      await gcRunner.commitTransaction()
      assert.ok(await dataSource.getRepository(DocumentIndexModel).findOneBy({ id: fixture.documentIndex.id }))
      assert.ok(
        await dataSource.getRepository(KnowledgeBaseDocumentModel).findOneBy({
          knowledgeBaseId: fixture.knowledgeBase.id,
          documentId: fixture.document.id,
        }),
      )
    } finally {
      await releaseRunner(gcRunner)
      await releaseRunner(writerRunner)
      await releaseRunner(holderRunner)
      await cleanup()
    }
  },
)

test(
  'index GC rereads the retention cutoff after waiting for a concurrent cutoff update',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)
    let holderRunner: QueryRunner | null = null
    let gcRunner: QueryRunner | null = null

    try {
      await registerPgStatActivitySchema(dataSource)
      const fixture = await createFixture(dataSource, 'gc-cutoff-lock-race')
      const indexRepository = new DocumentIndexRepository(persistenceTransaction)
      const candidate = await indexRepository.findByDocumentIndexId({ documentIndexId: fixture.documentIndex.id })
      assert.ok(candidate)

      holderRunner = dataSource.createQueryRunner()
      await holderRunner.connect()
      await holderRunner.startTransaction()
      assert.ok(
        await persistenceTransaction.bind(holderRunner.manager, () =>
          indexRepository.lockByDocumentIndexId({ documentIndexId: fixture.documentIndex.id }),
        ),
      )

      gcRunner = dataSource.createQueryRunner()
      const gcConnection = await gcRunner.connect()
      await gcRunner.startTransaction()
      const gcPid = backendPid(gcConnection)
      const gcUseCase = createCollector(persistenceTransaction, retrievalDataSource)
      const gcResultPromise = persistenceTransaction.bind(gcRunner.manager, () =>
        gcUseCase.execute({
          scope: lockScope(fixture.document.id, new Date('2024-01-01T00:00:00.000Z')),
          candidates: [candidate],
        }),
      )
      await waitForLockWait(dataSource, gcPid, 'index GC never entered the index row lock wait')

      const laterCutoff = new Date('2025-01-01T00:00:00.000Z')
      await persistenceTransaction.bind(holderRunner.manager, () =>
        indexRepository.updateByDocumentIndexIdWithUnreferencedSince({
          documentIndexId: fixture.documentIndex.id,
          unreferencedSince: laterCutoff,
        }),
      )
      await holderRunner.commitTransaction()

      assert.deepEqual(await gcResultPromise, [], 'GC uses the updated unreferencedSince after row-lock acquisition')
      await gcRunner.commitTransaction()
      const persistedIndex = await dataSource.getRepository(DocumentIndexModel).findOneBy({
        id: fixture.documentIndex.id,
      })
      assert.equal(persistedIndex?.unreferencedSince?.toISOString(), laterCutoff.toISOString())
    } finally {
      await releaseRunner(gcRunner)
      await releaseRunner(holderRunner)
      await cleanup()
    }
  },
)

test(
  'index GC preserves an index when a leased retry job is inserted ahead of its row lock',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)
    let holderRunner: QueryRunner | null = null
    let writerRunner: QueryRunner | null = null
    let gcRunner: QueryRunner | null = null

    try {
      await registerPgStatActivitySchema(dataSource)
      const fixture = await createFixture(dataSource, 'gc-retry-lock-race')
      await dataSource.getRepository(KnowledgeBaseDocumentModel).insert({
        knowledgeBaseId: fixture.knowledgeBase.id,
        documentId: fixture.document.id,
        activeDocumentIndexId: null,
        requestedGeneration: '2',
        isEntry: false,
        alwaysIncludeFullContent: false,
      })
      const indexRepository = new DocumentIndexRepository(persistenceTransaction)
      const candidate = await indexRepository.findByDocumentIndexId({ documentIndexId: fixture.documentIndex.id })
      assert.ok(candidate)
      const failedJob = {
        id: randomUUID(),
        jobId: randomUUID(),
        knowledgeBaseId: fixture.knowledgeBase.id,
        documentId: fixture.document.id,
        documentIndexId: fixture.documentIndex.id,
        generation: '1',
        attempts: 4,
        errorCode: 'TEST',
        errorMessage: null,
        blockedReasons: [],
        retryPayload: {},
        failedAt: new Date('2020-01-01T00:00:00.000Z'),
        retriedAt: new Date(),
      } satisfies Partial<FailedJobModel>
      await dataSource.getRepository(FailedJobModel).insert(failedJob)

      holderRunner = dataSource.createQueryRunner()
      await holderRunner.connect()
      await holderRunner.startTransaction()
      assert.ok(
        await persistenceTransaction.bind(holderRunner.manager, () =>
          indexRepository.lockByDocumentIndexId({ documentIndexId: fixture.documentIndex.id }),
        ),
      )

      writerRunner = dataSource.createQueryRunner()
      const writerConnection = await writerRunner.connect()
      await writerRunner.startTransaction()
      const writerPid = backendPid(writerConnection)
      const leaseToken = randomUUID()
      const claimedAt = new Date()
      const leaseExpiresAt = new Date(Date.now() + 60_000)
      const retryJobId = randomUUID()
      const retryJob = {
        id: retryJobId,
        knowledgeBaseId: fixture.knowledgeBase.id,
        documentId: fixture.document.id,
        documentIndexId: fixture.documentIndex.id,
        generation: '2',
        status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
        attempts: 1,
        availableAt: new Date(),
        reservedAt: claimedAt,
        leaseToken,
        idempotencyKey: null,
        retryOfFailedJobId: failedJob.id,
        payload: {},
        executionState: null,
        executionVerification: JobExecutionVerificationAdapter.toJobExecutionVerificationPersistence({
          stage: DocumentIndexExecutionStageEnum.CLAIMED,
          completedUnits: 0,
          totalUnits: null,
          verifiedAt: claimedAt.toISOString(),
          claimToken: leaseToken,
          leaseExpiresAt: leaseExpiresAt.toISOString(),
        }),
        leaseExpiresAt,
      } satisfies Partial<JobModel>
      const retryJobRepository = writerRunner.manager.getRepository(JobModel)
      const retrySave = retryJobRepository.insert(
        retryJob as unknown as Parameters<typeof retryJobRepository.insert>[0],
      )
      await waitForLockWait(dataSource, writerPid, 'retry insert never entered a PostgreSQL lock wait')

      gcRunner = dataSource.createQueryRunner()
      const gcConnection = await gcRunner.connect()
      await gcRunner.startTransaction()
      const gcPid = backendPid(gcConnection)
      const gcUseCase = createCollector(persistenceTransaction, retrievalDataSource)
      const gcResultPromise = persistenceTransaction.bind(gcRunner.manager, () =>
        gcUseCase.execute({
          scope: lockScope(fixture.document.id, new Date('2024-01-01T00:00:00.000Z')),
          candidates: [candidate],
        }),
      )
      await waitForLockWait(dataSource, gcPid, 'index GC never entered the index row lock wait')

      await holderRunner.commitTransaction()
      await retrySave
      assert.ok(await readLockWait(dataSource, gcPid), 'GC remains blocked while the retry lease transaction is open')
      await writerRunner.commitTransaction()

      assert.deepEqual(await gcResultPromise, [], 'GC sees the retry execution after acquiring the index lock')
      await gcRunner.commitTransaction()
      const persistedJob = await dataSource.getRepository(JobModel).findOneBy({ id: retryJobId })
      assert.equal(persistedJob?.retryOfFailedJobId, failedJob.id)
      assert.equal(persistedJob?.leaseToken, leaseToken)
      assert.equal(persistedJob?.leaseExpiresAt?.toISOString(), leaseExpiresAt.toISOString())
      assert.ok(await dataSource.getRepository(DocumentIndexModel).findOneBy({ id: fixture.documentIndex.id }))
    } finally {
      await releaseRunner(gcRunner)
      await releaseRunner(writerRunner)
      await releaseRunner(holderRunner)
      await cleanup()
    }
  },
)
