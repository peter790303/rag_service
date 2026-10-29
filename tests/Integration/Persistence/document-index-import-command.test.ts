import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { JobModel } from '../../../src/Infrastructure/Persistence/Models/job.model.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

test(
  'import CLI submits through internal Nest services without auth secret or reachable HTTP API',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const database = await createPersistenceTestDatabase()
    const fixtureDirectory = await mkdtemp(resolve(tmpdir(), 'rag-internal-import-'))

    try {
      const manifestPath = resolve(fixtureDirectory, 'manifest.json')
      await writeFile(resolve(fixtureDirectory, 'note.md'), '# Imported fixture')
      await writeFile(
        manifestPath,
        JSON.stringify({
          version: 1,
          entries: [
            {
              sourceType: 'obsidian',
              projectId: `internal-import-${randomUUID()}`,
              projectName: 'Internal import test',
              knowledgeBaseId: randomUUID(),
              sourceKey: fixtureDirectory,
              sourcePath: 'note.md',
              title: 'Note',
              isEntry: false,
              alwaysIncludeFullContent: false,
            },
          ],
        }),
      )

      const childEnvironment = { ...process.env }
      delete childEnvironment.RAG_SERVICE_AUTH_SECRET
      childEnvironment.RAG_DB_SCHEMA = database.schema
      childEnvironment.RAG_DATABASE_URL = process.env.RAG_DATABASE_URL
      childEnvironment.RAG_IMPORT_TIMEOUT_MS = '1000'
      childEnvironment.RAG_IMPORT_MANIFEST = resolve(fixtureDirectory, 'unused-default-manifest.json')
      childEnvironment.RAG_SERVICE_BASE_URL = 'http://127.0.0.1:1'
      delete childEnvironment.OBSIDIAN_ROOT

      const result = spawnSync(process.execPath, ['scripts/import.mjs', 'obsidian', '--manifest', manifestPath], {
        cwd: resolve(import.meta.dirname, '../../../..'),
        env: childEnvironment,
        encoding: 'utf8',
        timeout: 20_000,
      })

      assert.equal(result.error, undefined, result.error?.message ?? '')
      assert.equal(result.status, 1)
      assert.match(result.stderr, /Timed out waiting for indexing/)
      assert.doesNotMatch(result.stderr, /RAG_SERVICE_AUTH_SECRET|ECONNREFUSED|fetch/i)
      assert.equal(await database.dataSource.getRepository(JobModel).count(), 1)
    } finally {
      await rm(fixtureDirectory, { recursive: true, force: true })
      await database.cleanup()
    }
  },
)
