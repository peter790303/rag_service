import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { KnowledgeBaseRepository as KnowledgeBaseRepositoryContract } from '../../../src/Application/KnowledgeBases/Contracts/knowledge-base.repository.ts'
import { EnsureIndexingKnowledgeBaseUseCase } from '../../../src/Application/KnowledgeBases/UseCases/ensure-indexing-knowledge-base.use-case.ts'
import { KnowledgeBaseProjectMismatchException } from '../../../src/Domain/KnowledgeBase/Exceptions/knowledge-base-project-mismatch.exception.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { KnowledgeBaseRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base.repository.ts'
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
    const useCase = new EnsureIndexingKnowledgeBaseUseCase(concurrentRepository)
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
