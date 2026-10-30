import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants.js'
import { getDataSourceToken } from '@nestjs/typeorm'

import {
  createRetrievalReadonlyDataSourceOptions,
  RETRIEVAL_READONLY_DATA_SOURCE,
} from '../../../src/Bootstrap/Nest/Providers/retrieval-readonly-data-source.options.ts'
import { ChunkRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/chunk.repository.ts'
import { KnowledgeBaseModel } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'

test('retrieval uses a dedicated source without extension or schema writes', () => {
  const entities = [KnowledgeBaseModel]
  const settings = { url: 'postgresql://unused@localhost/unused', schema: 'test_retrieval', entities }
  const retrievalDataSourceOptions = createRetrievalReadonlyDataSourceOptions(settings)

  assert.equal(retrievalDataSourceOptions.schema, settings.schema)
  assert.equal(retrievalDataSourceOptions.entities, entities)
  assert.equal(retrievalDataSourceOptions.installExtensions, false)
  assert.equal(retrievalDataSourceOptions.synchronize, false)
  assert.equal(retrievalDataSourceOptions.migrationsRun, false)
  assert.equal(retrievalDataSourceOptions.dropSchema, false)
  assert.deepEqual(retrievalDataSourceOptions.migrations, [])
  assert.equal(retrievalDataSourceOptions.extra.options, '-c default_transaction_read_only=on')
  assert.equal(
    new URL(retrievalDataSourceOptions.url ?? '').searchParams.get('options'),
    retrievalDataSourceOptions.extra.options,
  )
  assert.equal(settings.url, 'postgresql://unused@localhost/unused')
})

test('URL startup options preserve other settings and cannot override retrieval readonly', () => {
  const url = new URL('postgresql://unused@localhost/unused?sslmode=require')
  url.searchParams.set('options', '-c statement_timeout=5000 -c default_transaction_read_only=off')
  const retrievalDataSourceOptions = createRetrievalReadonlyDataSourceOptions({
    url: url.toString(),
    schema: 'test_retrieval',
    entities: [KnowledgeBaseModel],
  })
  const retrievalUrl = new URL(retrievalDataSourceOptions.url ?? '')
  const startupOptions = retrievalUrl.searchParams.get('options')

  assert.equal(retrievalUrl.searchParams.get('sslmode'), 'require')
  assert.equal(
    startupOptions,
    '-c statement_timeout=5000 -c default_transaction_read_only=off -c default_transaction_read_only=on',
  )
  assert.equal(retrievalDataSourceOptions.extra.options, startupOptions)
})

test('the snapshot transaction and chunk repository inject the named readonly source', () => {
  const candidateDependencies: unknown = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, ChunkRepository)
  const transactionDependencies: unknown = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, PersistenceTransaction)

  assert.ok(Array.isArray(candidateDependencies))
  assert.deepEqual(
    candidateDependencies.find((dependency: { index: number }) => dependency.index === 1),
    { index: 1, param: getDataSourceToken(RETRIEVAL_READONLY_DATA_SOURCE) },
  )
  assert.ok(Array.isArray(transactionDependencies))
  assert.deepEqual(
    transactionDependencies.find((dependency: { index: number }) => dependency.index === 0),
    { index: 0, param: getDataSourceToken() },
  )
  assert.deepEqual(
    transactionDependencies.find((dependency: { index: number }) => dependency.index === 1),
    { index: 1, param: getDataSourceToken(RETRIEVAL_READONLY_DATA_SOURCE) },
  )
})
