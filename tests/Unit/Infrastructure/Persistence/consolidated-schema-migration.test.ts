import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { QueryRunner } from 'typeorm'

import { CreateKnowledgeBases1729000000001 } from '../../../../src/Shared/Infrastructure/Persistence/TypeORM/Migrations/1729000000001-create-knowledge-bases.ts'
import { CreateDocuments1729000000002 } from '../../../../src/Shared/Infrastructure/Persistence/TypeORM/Migrations/1729000000002-create-documents.ts'
import { CreateJobs1729000000008 } from '../../../../src/Shared/Infrastructure/Persistence/TypeORM/Migrations/1729000000008-create-jobs.ts'

const captureStatements = () => {
  const statements: string[] = []
  const queryRunner = {
    connection: { options: { schema: 'baseline"schema' } },
    query: async (statement: string) => {
      statements.push(statement)
    },
  } as unknown as QueryRunner

  return { statements, queryRunner }
}

test('fresh knowledge-base schema separates unique project identity from mutable display names', async () => {
  const { statements, queryRunner } = captureStatements()
  await new CreateKnowledgeBases1729000000001().up(queryRunner)
  const definition = statements.find((statement) => statement.startsWith('CREATE TABLE knowledge_bases'))
  assert.ok(definition)
  assert.match(definition, /project_id text NOT NULL UNIQUE/)
  assert.match(definition, /project_name text NOT NULL,/)
  assert.equal(statements[0], 'CREATE SCHEMA IF NOT EXISTS "baseline""schema"')
  assert.equal(statements.at(-1), 'RESET search_path')
})

test('fresh document schema supports untitled documents without an upgrade migration', async () => {
  const { statements, queryRunner } = captureStatements()
  await new CreateDocuments1729000000002().up(queryRunner)
  assert.match(statements.join('\n'), /current_title text,/)
})

test('fresh jobs schema includes normalized lease expiry and its ordered recovery index', async () => {
  const { statements, queryRunner } = captureStatements()
  await new CreateJobs1729000000008().up(queryRunner)
  const definition = statements.find((statement) => statement.startsWith('CREATE TABLE jobs'))
  assert.ok(definition)
  assert.match(definition, /lease_expires_at timestamptz,/)
  assert.ok(
    statements.some((statement) =>
      /CREATE INDEX idx_jobs_status_lease_expiry ON jobs ?\(status, lease_expires_at, created_at, id\)/.test(statement),
    ),
  )
  assert.equal(statements.at(-1), 'RESET search_path')
})
