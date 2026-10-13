import { randomUUID } from 'node:crypto'

import type { DataSource } from 'typeorm'

import { createDataSource } from '../../database/data-source.js'

export interface TestDatabaseContext {
  schema: string
  dataSource: DataSource
  cleanup: () => Promise<void>
}

export async function createTestDatabase(): Promise<TestDatabaseContext> {
  const schema = `test_${randomUUID().replace(/-/g, '')}`
  const dataSource = createDataSource(schema)
  await dataSource.initialize()

  const runner = dataSource.createQueryRunner()
  await runner.createSchema(schema, true)
  await runner.release()

  await dataSource.runMigrations()

  return {
    schema,
    dataSource,
    cleanup: async () => {
      try {
        const cleanupRunner = dataSource.createQueryRunner()
        await cleanupRunner.dropSchema(schema, true, true)
        await cleanupRunner.release()
      } finally {
        await dataSource.destroy()
      }
    },
  }
}
