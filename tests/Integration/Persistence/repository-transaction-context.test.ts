import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { KnowledgeBaseModel } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base.model.ts'
import { KnowledgeBaseRepository } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base.repository.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

test(
  'a shared repository joins the current transaction, rolls back its writes and resolves a fresh manager afterward',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)
    const knowledgeBaseRepository = new KnowledgeBaseRepository(persistenceTransaction)
    const knowledgeBaseId = randomUUID()
    const projectId = `repository-transaction-${randomUUID()}`
    const now = new Date()
    const createKnowledgeBaseQO = {
      knowledgeBaseId,
      projectId,
      projectName: 'transaction context',
      createdAt: now,
      updatedAt: now,
    }
    const rollbackFailure = new Error('roll back repository write')

    try {
      await assert.rejects(
        persistenceTransaction.run(async () => {
          await knowledgeBaseRepository.create(createKnowledgeBaseQO)
          assert.equal((await knowledgeBaseRepository.findByKnowledgeBaseId({ knowledgeBaseId }))?.projectId, projectId)
          assert.equal(await dataSource.getRepository(KnowledgeBaseModel).findOneBy({ id: knowledgeBaseId }), null)

          await persistenceTransaction.run(async () => {
            assert.equal(
              (await knowledgeBaseRepository.findByKnowledgeBaseIdAndProjectId({ knowledgeBaseId, projectId }))?.id,
              knowledgeBaseId,
            )
          })

          throw rollbackFailure
        }),
        (failure) => failure === rollbackFailure,
      )

      assert.equal(await knowledgeBaseRepository.findByKnowledgeBaseId({ knowledgeBaseId }), null)
      assert.equal(await dataSource.getRepository(KnowledgeBaseModel).findOneBy({ id: knowledgeBaseId }), null)

      await persistenceTransaction.run(() => knowledgeBaseRepository.create(createKnowledgeBaseQO))
      assert.equal((await knowledgeBaseRepository.findByKnowledgeBaseId({ knowledgeBaseId }))?.projectId, projectId)
      assert.equal(
        (await knowledgeBaseRepository.findByKnowledgeBaseIdAndProjectId({ knowledgeBaseId, projectId }))?.id,
        knowledgeBaseId,
      )
    } finally {
      await cleanup()
    }
  },
)

test(
  'concurrent transactions sharing one repository cannot observe each other uncommitted writes or share rollback',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)
    const knowledgeBaseRepository = new KnowledgeBaseRepository(persistenceTransaction)
    const rolledBackKnowledgeBaseId = randomUUID()
    const committedKnowledgeBaseId = randomUUID()
    const rollbackFailure = new Error('roll back only the first transaction')
    let releaseFirstWrite!: () => void
    const firstWriteReady = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve
    })
    let releaseSecondWrite!: () => void
    const secondWriteReady = new Promise<void>((resolve) => {
      releaseSecondWrite = resolve
    })
    let releaseFirstRead!: () => void
    const firstReadReady = new Promise<void>((resolve) => {
      releaseFirstRead = resolve
    })

    try {
      const transactionOutcomes = await Promise.allSettled([
        persistenceTransaction.run(async () => {
          try {
            try {
              await knowledgeBaseRepository.create({
                knowledgeBaseId: rolledBackKnowledgeBaseId,
                projectId: `repository-rollback-${randomUUID()}`,
                projectName: 'rolled back project',
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            } finally {
              releaseFirstWrite()
            }

            await secondWriteReady
            assert.ok(
              await knowledgeBaseRepository.findByKnowledgeBaseId({ knowledgeBaseId: rolledBackKnowledgeBaseId }),
            )
            assert.equal(
              await knowledgeBaseRepository.findByKnowledgeBaseId({ knowledgeBaseId: committedKnowledgeBaseId }),
              null,
            )
            throw rollbackFailure
          } finally {
            releaseFirstRead()
          }
        }),
        persistenceTransaction.run(async () => {
          try {
            await knowledgeBaseRepository.create({
              knowledgeBaseId: committedKnowledgeBaseId,
              projectId: `repository-commit-${randomUUID()}`,
              projectName: 'committed project',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          } finally {
            releaseSecondWrite()
          }

          await firstWriteReady
          assert.ok(await knowledgeBaseRepository.findByKnowledgeBaseId({ knowledgeBaseId: committedKnowledgeBaseId }))
          assert.equal(
            await knowledgeBaseRepository.findByKnowledgeBaseId({ knowledgeBaseId: rolledBackKnowledgeBaseId }),
            null,
          )
          await firstReadReady
        }),
      ])

      assert.deepEqual(transactionOutcomes, [
        { status: 'rejected', reason: rollbackFailure },
        { status: 'fulfilled', value: undefined },
      ])
      assert.equal(
        await knowledgeBaseRepository.findByKnowledgeBaseId({ knowledgeBaseId: rolledBackKnowledgeBaseId }),
        null,
      )
      assert.ok(await knowledgeBaseRepository.findByKnowledgeBaseId({ knowledgeBaseId: committedKnowledgeBaseId }))
      assert.equal(await dataSource.getRepository(KnowledgeBaseModel).count(), 1)
    } finally {
      await cleanup()
    }
  },
)
