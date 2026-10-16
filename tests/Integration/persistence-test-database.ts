import { randomUUID } from 'node:crypto'

import { DataSource } from 'typeorm'

import { createDataSource } from '../../database/data-source.ts'
import { createRetrievalReadonlyDataSourceOptions } from '../../src/Infrastructure/Providers/retrieval-readonly-data-source.options.ts'

export interface PersistenceTestDatabaseContext {
  schema: string
  dataSource: DataSource
  retrievalDataSource: DataSource
  cleanup: () => Promise<void>
}

export async function createPersistenceTestDatabase(): Promise<PersistenceTestDatabaseContext> {
  const schema = `test_${randomUUID().replace(/-/g, '')}`
  const dataSource = createDataSource(schema)
  const persistenceDataSourceOptions = dataSource.options

  if (
    persistenceDataSourceOptions.type !== 'postgres' ||
    !persistenceDataSourceOptions.url ||
    !persistenceDataSourceOptions.entities
  ) {
    throw new Error('Integration tests require a PostgreSQL URL and entities')
  }

  const retrievalDataSource = new DataSource(
    createRetrievalReadonlyDataSourceOptions({
      url: persistenceDataSourceOptions.url,
      schema,
      entities: persistenceDataSourceOptions.entities,
    }),
  )
  let schemaCreated = false
  const cleanup = async () => {
    try {
      if (retrievalDataSource.isInitialized) await retrievalDataSource.destroy()
    } finally {
      if (dataSource.isInitialized) {
        try {
          if (schemaCreated) {
            const cleanupRunner = dataSource.createQueryRunner()
            try {
              await cleanupRunner.dropSchema(schema, true, true)
              schemaCreated = false
            } finally {
              await cleanupRunner.release()
            }
          }
        } finally {
          await dataSource.destroy()
        }
      }
    }
  }

  try {
    await dataSource.initialize()
    const runner = dataSource.createQueryRunner()
    try {
      await runner.createSchema(schema, true)
      schemaCreated = true
    } finally {
      await runner.release()
    }
    await dataSource.runMigrations()
    await retrievalDataSource.initialize()
  } catch (error) {
    try {
      await cleanup()
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Integration database initialization and cleanup failed', {
        cause: cleanupError,
      })
    }
    throw error
  }

  return {
    schema,
    dataSource,
    retrievalDataSource,
    cleanup,
  }
}
