import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions.d.ts'

export const RETRIEVAL_READONLY_DATA_SOURCE = 'rag-retrieval'

type RetrievalReadonlyDataSourceSettings = {
  url: string
  schema: string
  entities: NonNullable<PostgresDataSourceOptions['entities']>
}

export const createRetrievalReadonlyDataSourceOptions = (
  settings: RetrievalReadonlyDataSourceSettings,
): PostgresDataSourceOptions => {
  const connectionUrl = new URL(settings.url)
  const configuredStartupOptions = connectionUrl.searchParams.get('options')
  const startupOptions = [configuredStartupOptions, '-c default_transaction_read_only=on'].filter(Boolean).join(' ')
  connectionUrl.searchParams.set('options', startupOptions)

  return {
    type: 'postgres',
    url: connectionUrl.toString(),
    schema: settings.schema,
    entities: settings.entities,
    extra: { options: startupOptions },
    installExtensions: false,
    synchronize: false,
    migrations: [],
    migrationsRun: false,
    dropSchema: false,
  }
}
