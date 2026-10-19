import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { KnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { DocumentIndexSuccessReceiptRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index-success-receipt.repository.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

test(
  'successful document-index receipts remain project-scoped after their knowledge base is deleted',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)
    const successArchive = new DocumentIndexSuccessReceiptRepository(persistenceTransaction)
    const knowledgeBaseId = randomUUID()
    const documentId = randomUUID()
    const documentIndexId = randomUUID()
    const jobId = randomUUID()
    const projectId = `env-smoke-${randomUUID()}`
    const completedAt = new Date('2026-10-18T12:00:00.000Z')
    const executionVerification = { stage: 'VERIFYING', completedUnits: 4, totalUnits: 4 }

    try {
      await dataSource.getRepository(KnowledgeBaseModel).insert({
        id: knowledgeBaseId,
        projectId,
        projectName: 'Success receipt integration test',
      })

      await persistenceTransaction.run(() =>
        successArchive.archiveSuccess({
          projectId,
          jobId,
          knowledgeBaseId,
          documentId,
          documentIndexId,
          generation: '9007199254740993',
          attempts: 2,
          executionVerification,
          completedAt,
        }),
      )

      await dataSource.getRepository(KnowledgeBaseModel).delete({ id: knowledgeBaseId })

      assert.equal(
        await successArchive.findSuccessByProjectIdAndJobId({
          projectId: `another-project-${randomUUID()}`,
          jobId,
        }),
        null,
      )
      assert.deepEqual(await successArchive.findSuccessByProjectIdAndJobId({ projectId, jobId }), {
        jobId,
        projectId,
        knowledgeBaseId,
        documentId,
        documentIndexId,
        generation: '9007199254740993',
        attempts: 2,
        executionVerification,
        completedAt,
      })
    } finally {
      await cleanup()
    }
  },
)
