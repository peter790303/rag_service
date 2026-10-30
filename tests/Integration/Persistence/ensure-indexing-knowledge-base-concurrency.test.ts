import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { EnsureIndexingKnowledgeBaseCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/ensure-indexing-knowledge-base.command.handler.ts'
import { KnowledgeBaseRepository as KnowledgeBaseRepositoryContract } from '../../../src/KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base.repository.ts'
import { KnowledgeBaseProjectMismatchException } from '../../../src/KnowledgeBases/Domain/Exceptions/knowledge-base-project-mismatch.exception.ts'
import { KnowledgeBaseRepository } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base.repository.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

test(
  'concurrent indexing requests create one knowledge base and preserve project ownership checks',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)
    const repository = new KnowledgeBaseRepository(persistenceTransaction)
    const knowledgeBaseId = randomUUID()
    let missingReads = 0
    let releaseMissingReads!: () => void
    const bothReadMissing = new Promise<void>((resolve) => {
      releaseMissingReads = resolve
    })
    const concurrentRepository = {
      lockByKnowledgeBaseId: async (query: { knowledgeBaseId: string }) => {
        const knowledgeBase = await repository.lockByKnowledgeBaseId(query)

        if (knowledgeBase === null) {
          missingReads += 1

          if (missingReads === 2) releaseMissingReads()

          await bothReadMissing
        }

        return knowledgeBase
      },
      createIfAbsent: (query: Parameters<typeof repository.createIfAbsent>[0]) => repository.createIfAbsent(query),
      update: (query: Parameters<typeof repository.update>[0]) => repository.update(query),
    } as unknown as KnowledgeBaseRepositoryContract
    const useCase = new EnsureIndexingKnowledgeBaseCommandHandler(concurrentRepository)
    const sharedInput = {
      knowledgeBaseId,
      projectId: `concurrent-project-${randomUUID()}`,
      projectName: 'Concurrent project',
    }

    try {
      await Promise.all([
        persistenceTransaction.run(() => useCase.execute(sharedInput)),
        persistenceTransaction.run(() => useCase.execute(sharedInput)),
      ])

      assert.equal(missingReads, 2)
      const persistedKnowledgeBase = await repository.findByKnowledgeBaseId({ knowledgeBaseId })
      assert.ok(persistedKnowledgeBase)
      assert.equal(persistedKnowledgeBase.projectId, sharedInput.projectId)

      await assert.rejects(
        persistenceTransaction.run(() =>
          useCase.execute({ ...sharedInput, projectId: `different-project-${randomUUID()}` }),
        ),
        KnowledgeBaseProjectMismatchException,
      )
    } finally {
      await cleanup()
    }
  },
)
