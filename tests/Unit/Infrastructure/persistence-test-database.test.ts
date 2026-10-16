import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

import { DataSource } from 'typeorm'

const mockDatabaseLifecycle = (
  context: TestContext,
  failure: 'initialize' | 'schema' | 'migration' | 'readonly' | null,
) => {
  const originalDatabaseUrl = process.env.RAG_DATABASE_URL
  process.env.RAG_DATABASE_URL = 'postgresql://test:test@localhost/test'
  context.after(() => {
    if (originalDatabaseUrl === undefined) delete process.env.RAG_DATABASE_URL
    else process.env.RAG_DATABASE_URL = originalDatabaseUrl
  })
  const cause = new Error(`failure at ${failure}`)
  const initialized: DataSource[] = []
  const destroyed: DataSource[] = []
  const createdSchemas: string[] = []
  const droppedSchemas: string[] = []
  let releases = 0
  const originalCreateQueryRunner = DataSource.prototype.createQueryRunner
  context.mock.method(DataSource.prototype, 'initialize', async function (this: DataSource) {
    if (failure === 'initialize' || (failure === 'readonly' && initialized.length === 1)) throw cause

    Object.defineProperty(this, 'isInitialized', { value: true, configurable: true })
    initialized.push(this)

    return this
  })
  context.mock.method(DataSource.prototype, 'destroy', async function (this: DataSource) {
    destroyed.push(this)
    Object.defineProperty(this, 'isInitialized', { value: false, configurable: true })
  })
  context.mock.method(DataSource.prototype, 'createQueryRunner', function (this: DataSource) {
    const runner = originalCreateQueryRunner.call(this)
    context.mock.method(runner, 'createSchema', async (schema: string) => {
      if (failure === 'schema') throw cause

      createdSchemas.push(schema)
    })
    context.mock.method(runner, 'dropSchema', async (schema: string, ifExist: boolean, cascade: boolean) => {
      assert.equal(ifExist, true)
      assert.equal(cascade, true)
      droppedSchemas.push(schema)
    })
    context.mock.method(runner, 'release', async () => {
      releases += 1
    })

    return runner
  })
  context.mock.method(DataSource.prototype, 'runMigrations', async () => {
    if (failure === 'migration') throw cause

    return []
  })

  return { cause, initialized, destroyed, createdSchemas, droppedSchemas, releases: () => releases }
}

;(['initialize', 'schema', 'migration', 'readonly'] as const).forEach((failure) => {
  test(`integration database cleans up after ${failure} failure and preserves the original error`, async (context) => {
    const lifecycle = mockDatabaseLifecycle(context, failure)
    const { createPersistenceTestDatabase } = await import('../../Integration/persistence-test-database.ts')

    await assert.rejects(createPersistenceTestDatabase(), (error: unknown) => error === lifecycle.cause)

    assert.deepEqual(lifecycle.destroyed, lifecycle.initialized)
    assert.deepEqual(lifecycle.droppedSchemas, lifecycle.createdSchemas)
    lifecycle.droppedSchemas.forEach((schema) => assert.match(schema, /^test_[0-9a-f]{32}$/))
    assert.equal(lifecycle.releases(), failure === 'initialize' ? 0 : failure === 'schema' ? 1 : 2)
  })
})

test('integration database cleanup releases both connections and drops only its own schema once', async (context) => {
  const lifecycle = mockDatabaseLifecycle(context, null)
  const { createPersistenceTestDatabase } = await import('../../Integration/persistence-test-database.ts')
  const database = await createPersistenceTestDatabase()

  assert.match(database.schema, /^test_[0-9a-f]{32}$/)
  await database.cleanup()
  await database.cleanup()

  assert.deepEqual(lifecycle.createdSchemas, [database.schema])
  assert.deepEqual(lifecycle.droppedSchemas, [database.schema])
  assert.deepEqual(lifecycle.destroyed, [database.retrievalDataSource, database.dataSource])
  assert.equal(lifecycle.releases(), 2)
})

test('integration database retains initialization and cleanup failures together', async (context) => {
  const lifecycle = mockDatabaseLifecycle(context, 'migration')
  const cleanupCause = new Error('failed to close connection')
  context.mock.method(DataSource.prototype, 'destroy', async () => {
    throw cleanupCause
  })
  const { createPersistenceTestDatabase } = await import('../../Integration/persistence-test-database.ts')

  await assert.rejects(createPersistenceTestDatabase(), (error: unknown) => {
    assert.ok(error instanceof AggregateError)
    assert.deepEqual(error.errors, [lifecycle.cause, cleanupCause])
    assert.equal(error.cause, cleanupCause)

    return true
  })
  assert.deepEqual(lifecycle.droppedSchemas, lifecycle.createdSchemas)
})

test('integration database still cleans writable resources when readonly close fails', async (context) => {
  const lifecycle = mockDatabaseLifecycle(context, null)
  const { createPersistenceTestDatabase } = await import('../../Integration/persistence-test-database.ts')
  const database = await createPersistenceTestDatabase()
  const cleanupCause = new Error('failed to close readonly connection')
  context.mock.method(database.retrievalDataSource, 'destroy', async () => {
    throw cleanupCause
  })

  await assert.rejects(database.cleanup(), (error: unknown) => error === cleanupCause)

  assert.deepEqual(lifecycle.droppedSchemas, [database.schema])
  assert.deepEqual(lifecycle.destroyed, [database.dataSource])
})
