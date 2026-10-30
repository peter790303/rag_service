import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { concatMap, firstValueFrom, from, range, toArray } from 'rxjs'
import type { QueryRunner } from 'typeorm'

import { ChunkModel } from '../../../src/Chunks/Infrastructure/Persistence/TypeORM/Models/chunk.model.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { DocumentIndexSuccessReceiptModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index-success-receipt.model.ts'
import { DocumentIndexModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/DocumentRevisions/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { DocumentSourceTypeEnum } from '../../../src/Documents/Domain/Enums/document-source-type.enum.ts'
import { DocumentModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document.model.ts'
import { KnowledgeBaseModel } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base.model.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

const tableExistence = (queryRunner: QueryRunner, tablePaths: string[]): Promise<boolean[]> =>
  firstValueFrom(
    from(tablePaths).pipe(
      concatMap((tablePath) => from(queryRunner.hasTable(tablePath))),
      toArray(),
    ),
  )

test(
  'reversible migrations roll back while forward-only effects persist across reapply',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { schema, dataSource, cleanup } = await createPersistenceTestDatabase()
    const queryRunner = dataSource.createQueryRunner()
    const modelTablePaths = dataSource.entityMetadatas.map((metadata) => `${schema}.${metadata.tableName}`)
    const receiptTablePath = `${schema}.${dataSource.getMetadata(DocumentIndexSuccessReceiptModel).tableName}`
    const reversibleModelTablePaths = modelTablePaths.filter((tablePath) => tablePath !== receiptTablePath)
    const forwardOnlyMigrations = dataSource.migrations.slice(-1)

    try {
      assert.equal(await dataSource.showMigrations(), false)
      assert.deepEqual(
        await tableExistence(queryRunner, modelTablePaths),
        modelTablePaths.map(() => true),
      )
      assert.deepEqual(
        forwardOnlyMigrations.map((migration) => migration.name),
        ['CreateDocumentIndexSuccessReceipts1729000000014'],
      )

      const projectId = `roundtrip-${randomUUID()}`
      const knowledgeBaseRepository = dataSource.getRepository(KnowledgeBaseModel)
      const knowledgeBase = await knowledgeBaseRepository.save(
        knowledgeBaseRepository.create({ projectId, projectName: 'roundtrip' }),
      )
      const documentRepository = dataSource.getRepository(DocumentModel)
      const document = await documentRepository.save(
        documentRepository.create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
          sourceKey: randomUUID(),
          sourcePath: `roundtrip/${randomUUID()}.md`,
          currentTitle: 'Preserved document title',
          unreferencedSince: null,
        }),
      )
      const revisionRepository = dataSource.getRepository(DocumentRevisionModel)
      const revision = await revisionRepository.save(
        revisionRepository.create({
          documentId: document.id,
          contentSha256: 'a'.repeat(64),
          title: 'Preserved document title',
          content: 'roundtrip marker',
        }),
      )
      const documentIndexRepository = dataSource.getRepository(DocumentIndexModel)
      const documentIndex = await documentIndexRepository.save(
        documentIndexRepository.create({
          documentId: document.id,
          revisionId: revision.id,
          pipelineHash: 'b'.repeat(64),
          chunkingModel: 'roundtrip',
          chunkingProfile: 'roundtrip',
          embeddingModel: 'roundtrip',
          embeddingDimensions: 384,
          embeddingProfile: 'roundtrip',
          lexicalProfile: 'roundtrip',
          relationProfile: 'roundtrip',
          status: DocumentIndexStatusEnum.BUILDING,
          readyAt: null,
          unreferencedSince: null,
        }),
      )
      const chunkRepository = dataSource.getRepository(ChunkModel)
      const chunk = await chunkRepository.save(
        chunkRepository.create({
          documentIndexId: documentIndex.id,
          ordinal: 0,
          headingPath: [],
          content: 'roundtrip marker',
          blockStart: 0,
          blockEnd: 1,
          tokenCount: null,
          embedding: Array.from({ length: 384 }, () => 0),
          searchVector: "'roundtrip':1,2",
        }),
      )
      const persistedChunk = await chunkRepository.findOneByOrFail({ id: chunk.id })
      const receiptRepository = dataSource.getRepository(DocumentIndexSuccessReceiptModel)
      const receipt = await receiptRepository.save(
        receiptRepository.create({
          jobId: randomUUID(),
          projectId,
          knowledgeBaseId: knowledgeBase.id,
          documentId: document.id,
          documentIndexId: documentIndex.id,
          generation: '1',
          attempts: 0,
          executionVerification: null,
          completedAt: new Date('2026-10-18T00:00:00.000Z'),
        }),
      )

      await firstValueFrom(
        from(forwardOnlyMigrations).pipe(
          concatMap(() => dataSource.undoLastMigration()),
          toArray(),
        ),
      )

      assert.equal(await dataSource.showMigrations(), true)
      assert.deepEqual(
        await tableExistence(queryRunner, modelTablePaths),
        modelTablePaths.map(() => true),
      )
      assert.equal((await knowledgeBaseRepository.findOneByOrFail({ id: knowledgeBase.id })).projectId, projectId)
      assert.equal(
        (await documentRepository.findOneByOrFail({ id: document.id })).currentTitle,
        'Preserved document title',
      )
      assert.equal((await chunkRepository.findOneByOrFail({ id: chunk.id })).searchVector, persistedChunk.searchVector)
      const preservedReceipt = await receiptRepository.findOneByOrFail({ jobId: receipt.jobId })
      assert.equal(preservedReceipt.projectId, projectId)
      assert.equal(preservedReceipt.knowledgeBaseId, knowledgeBase.id)
      assert.equal(preservedReceipt.documentId, document.id)
      assert.equal(preservedReceipt.documentIndexId, documentIndex.id)

      await firstValueFrom(
        range(0, dataSource.migrations.length - forwardOnlyMigrations.length).pipe(
          concatMap(() => dataSource.undoLastMigration()),
          toArray(),
        ),
      )

      assert.equal(await dataSource.showMigrations(), true)
      assert.deepEqual(
        await tableExistence(queryRunner, reversibleModelTablePaths),
        reversibleModelTablePaths.map(() => false),
      )
      assert.deepEqual(await tableExistence(queryRunner, [receiptTablePath]), [true])
      assert.equal((await receiptRepository.findOneByOrFail({ jobId: receipt.jobId })).projectId, projectId)

      const reappliedMigrations = await dataSource.runMigrations()
      assert.deepEqual(
        reappliedMigrations.map((migration) => migration.name),
        dataSource.migrations.map((migration) => migration.name),
      )
      assert.deepEqual(
        await tableExistence(queryRunner, modelTablePaths),
        modelTablePaths.map(() => true),
      )
      assert.equal((await receiptRepository.findOneByOrFail({ jobId: receipt.jobId })).projectId, projectId)
      assert.equal(await dataSource.showMigrations(), false)
      assert.deepEqual(await dataSource.runMigrations(), [])
    } finally {
      await queryRunner.release()
      await cleanup()
    }
  },
)
