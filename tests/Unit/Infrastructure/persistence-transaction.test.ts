import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { DataSource, EntityManager } from 'typeorm'

import { ReadonlyDataSourceRequiredException } from '../../../src/Infrastructure/Persistence/Exceptions/readonly-data-source-required.exception.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'

describe('PersistenceTransaction', () => {
  it('uses the same manager for nested operations and restores the default afterward', async () => {
    const defaultManager = {} as EntityManager
    const transactionManager = {} as EntityManager
    let started = 0
    const persistenceTransaction = new PersistenceTransaction({
      manager: defaultManager,
      async transaction<T>(operation: (manager: EntityManager) => Promise<T>) {
        started += 1

        return operation(transactionManager)
      },
    } as DataSource)

    assert.equal(persistenceTransaction.manager, defaultManager)
    const transactionOutcome = await persistenceTransaction.run(async () => {
      assert.equal(persistenceTransaction.manager, transactionManager)

      return persistenceTransaction.run(async () => {
        assert.equal(persistenceTransaction.manager, transactionManager)

        return 'completed'
      })
    })

    assert.equal(transactionOutcome, 'completed')
    assert.equal(started, 1)
    assert.equal(persistenceTransaction.manager, defaultManager)
  })

  it('keeps concurrent async operations on their own managers', async () => {
    const persistenceTransaction = new PersistenceTransaction({ manager: {} } as DataSource)
    const first = {} as EntityManager
    const second = {} as EntityManager
    let releaseFirst!: () => void
    const firstReady = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let releaseSecond!: () => void
    const secondReady = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })

    await Promise.all([
      persistenceTransaction.bind(first, async () => {
        releaseFirst()
        await secondReady
        assert.equal(persistenceTransaction.manager, first)
      }),
      persistenceTransaction.bind(second, async () => {
        await firstReady
        releaseSecond()
        assert.equal(persistenceTransaction.manager, second)
      }),
    ])
  })

  it('joins a bound retrieval snapshot without starting a second transaction', async () => {
    const manager = {} as EntityManager
    const persistenceTransaction = new PersistenceTransaction({
      manager: {},
      transaction() {
        assert.fail('a bound snapshot already owns its transaction')
      },
    } as unknown as DataSource)

    await persistenceTransaction.bind(manager, () =>
      persistenceTransaction.run(async () => {
        assert.equal(persistenceTransaction.manager, manager)
      }),
    )
  })

  it('propagates failures to the transaction owner and clears its async binding', async () => {
    const defaultManager = {} as EntityManager
    const error = new Error('write failed')
    let rolledBack = false
    const persistenceTransaction = new PersistenceTransaction({
      manager: defaultManager,
      async transaction<T>(operation: (manager: EntityManager) => Promise<T>) {
        try {
          return await operation({} as EntityManager)
        } catch (failure) {
          rolledBack = true
          throw failure
        }
      },
    } as DataSource)

    await assert.rejects(
      persistenceTransaction.run(async () => {
        throw error
      }),
      (failure) => failure === error,
    )
    assert.equal(rolledBack, true)
    assert.equal(persistenceTransaction.manager, defaultManager)
  })

  it('runs a read snapshot on the dedicated source at repeatable read and shares its manager', async () => {
    const defaultManager = {} as EntityManager
    const snapshotManager = {} as EntityManager
    const isolationLevels: string[] = []
    const openSnapshot = async <T>(
      isolation: string,
      operation: (manager: EntityManager) => Promise<T>,
    ): Promise<T> => {
      isolationLevels.push(isolation)

      return operation(snapshotManager)
    }
    const persistenceTransaction = new PersistenceTransaction(
      {
        manager: defaultManager,
        transaction: () => assert.fail('a read snapshot must use the dedicated source'),
      } as unknown as DataSource,
      {
        manager: { transaction: openSnapshot },
        transaction: openSnapshot,
      } as unknown as DataSource,
    )

    const transactionOutcome = await persistenceTransaction.runReadOnlySnapshot(async () => {
      assert.equal(persistenceTransaction.manager, snapshotManager)
      await persistenceTransaction.run(async () => {
        assert.equal(persistenceTransaction.manager, snapshotManager)
      })

      return 'snapshot-result'
    })

    assert.equal(transactionOutcome, 'snapshot-result')
    assert.deepEqual(isolationLevels, ['REPEATABLE READ'])
    assert.equal(persistenceTransaction.manager, defaultManager)
  })

  it('propagates read snapshot failure and restores the default manager before the next snapshot', async () => {
    const defaultManager = {} as EntityManager
    const snapshotManagers = [{} as EntityManager, {} as EntityManager]
    const failure = new Error('snapshot read failed')
    let opened = 0
    let rolledBack = 0
    const openSnapshot = async <T>(
      isolation: string,
      operation: (manager: EntityManager) => Promise<T>,
    ): Promise<T> => {
      assert.equal(isolation, 'REPEATABLE READ')
      const snapshotManager = snapshotManagers[opened++]
      assert.ok(snapshotManager)
      try {
        return await operation(snapshotManager)
      } catch (error) {
        rolledBack += 1
        throw error
      }
    }
    const persistenceTransaction = new PersistenceTransaction(
      { manager: defaultManager } as DataSource,
      {
        manager: { transaction: openSnapshot },
        transaction: openSnapshot,
      } as unknown as DataSource,
    )

    await assert.rejects(
      persistenceTransaction.runReadOnlySnapshot(async () => {
        assert.equal(persistenceTransaction.manager, snapshotManagers[0])
        throw failure
      }),
      (error) => error === failure,
    )
    assert.equal(rolledBack, 1)
    assert.equal(persistenceTransaction.manager, defaultManager)

    await persistenceTransaction.runReadOnlySnapshot(async () => {
      assert.equal(persistenceTransaction.manager, snapshotManagers[1])
    })
    assert.equal(opened, 2)
    assert.equal(persistenceTransaction.manager, defaultManager)
  })

  it('opens a dedicated snapshot inside a write transaction and restores the outer manager', async () => {
    const defaultManager = {} as EntityManager
    const writeManager = {} as EntityManager
    let snapshotCount = 0
    const readonlyDataSource = {
      manager: {
        async transaction<T>(isolation: string, operation: (manager: EntityManager) => Promise<T>) {
          assert.equal(isolation, 'REPEATABLE READ')
          snapshotCount += 1

          return operation(snapshotManager)
        },
      },
    } as unknown as DataSource
    const snapshotManager = {
      connection: readonlyDataSource,
      queryRunner: { isTransactionActive: true },
    } as EntityManager
    const persistenceTransaction = new PersistenceTransaction(
      {
        manager: defaultManager,
        transaction: async <T>(operation: (manager: EntityManager) => Promise<T>) => operation(writeManager),
      } as unknown as DataSource,
      readonlyDataSource,
    )

    await persistenceTransaction.run(async () => {
      assert.equal(persistenceTransaction.manager, writeManager)
      await persistenceTransaction.runReadOnlySnapshot(async () => {
        assert.equal(persistenceTransaction.manager, snapshotManager)
        await persistenceTransaction.runReadOnlySnapshot(async () => {
          assert.equal(persistenceTransaction.manager, snapshotManager)
        })
      })
      assert.equal(persistenceTransaction.manager, writeManager)
    })

    assert.equal(snapshotCount, 1)
    assert.equal(persistenceTransaction.manager, defaultManager)
  })

  it('rejects a read snapshot when no dedicated readonly source is configured', async () => {
    const persistenceTransaction = new PersistenceTransaction({ manager: {} } as DataSource)

    await assert.rejects(
      persistenceTransaction.runReadOnlySnapshot(async () => assert.fail('a read callback must not run')),
      /dedicated readonly DataSource/,
    )
  })
})

it('rejects a read snapshot without a dedicated source before running the operation', async () => {
  const defaultManager = {} as EntityManager
  const persistenceTransaction = new PersistenceTransaction({ manager: defaultManager } as DataSource)
  let executed = false

  await assert.rejects(
    persistenceTransaction.runReadOnlySnapshot(async () => {
      executed = true
    }),
    ReadonlyDataSourceRequiredException,
  )
  assert.equal(executed, false)
  assert.equal(persistenceTransaction.manager, defaultManager)
})
