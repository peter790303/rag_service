import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { QueryRunner, Table } from 'typeorm'

import { CreateDocumentIndexSuccessReceipts1729000000014 } from '../../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Migrations/1729000000014-create-document-index-success-receipts.ts'

test('success receipt migration creates project-scoped durable receipts with job-compatible checks', async () => {
  let createdTable: Table | undefined
  let droppedTable = false
  const queryRunner = {
    connection: {
      options: { schema: 'migration_test' },
      driver: { buildTableName: (tableName: string, schema: string) => `${schema}.${tableName}` },
    },
    hasTable: async () => false,
    createTable: async (table: Table) => {
      createdTable = table
    },
    dropTable: async () => {
      droppedTable = true
    },
  } as unknown as QueryRunner
  const migration = new CreateDocumentIndexSuccessReceipts1729000000014()

  await migration.up(queryRunner)

  assert.equal(createdTable?.name, 'document_index_success_receipts')
  assert.equal(createdTable?.schema, 'migration_test')
  assert.deepEqual(
    createdTable?.columns.map(({ name, type, isNullable, isPrimary }) => ({ name, type, isNullable, isPrimary })),
    [
      { name: 'job_id', type: 'uuid', isNullable: false, isPrimary: true },
      { name: 'project_id', type: 'text', isNullable: false, isPrimary: false },
      { name: 'knowledge_base_id', type: 'uuid', isNullable: false, isPrimary: false },
      { name: 'document_id', type: 'uuid', isNullable: false, isPrimary: false },
      { name: 'document_index_id', type: 'uuid', isNullable: false, isPrimary: false },
      { name: 'generation', type: 'bigint', isNullable: false, isPrimary: false },
      { name: 'attempts', type: 'integer', isNullable: false, isPrimary: false },
      { name: 'execution_verification', type: 'jsonb', isNullable: true, isPrimary: false },
      { name: 'completed_at', type: 'timestamptz', isNullable: false, isPrimary: false },
    ],
  )
  assert.deepEqual(
    createdTable?.checks.map(({ name, expression }) => ({ name, expression })),
    [
      { name: 'document_index_success_receipts_generation_check', expression: 'generation > 0' },
      { name: 'document_index_success_receipts_attempts_check', expression: 'attempts BETWEEN 0 AND 4' },
    ],
  )
  assert.deepEqual(createdTable?.foreignKeys, [])

  await migration.down()

  assert.equal(droppedTable, false)
})
