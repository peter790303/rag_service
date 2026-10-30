import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { DocumentSourceTypeEnum } from '../../../src/Documents/Domain/Enums/document-source-type.enum.ts'
import { DocumentModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document.model.ts'
import { KnowledgeBaseModel } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base.model.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

test(
  'fresh baseline enforces project identity, allows duplicate display names and persists nullable current titles',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { schema, dataSource, cleanup } = await createPersistenceTestDatabase()
    const runner = dataSource.createQueryRunner()

    try {
      assert.equal(dataSource.migrations.length, 11)
      assert.ok(dataSource.migrations.every(({ name }) => !/^(Add|Rebuild)/.test(name ?? '')))
      assert.deepEqual(await dataSource.runMigrations({ transaction: 'all' }), [])
      assert.equal(await dataSource.showMigrations(), false)

      const bases = dataSource.getRepository(KnowledgeBaseModel)
      const projectId = randomUUID()
      const first = await bases.save(bases.create({ projectId, projectName: 'Shared display name' }))
      const second = await bases.save(bases.create({ projectId: randomUUID(), projectName: first.projectName }))
      assert.notEqual(first.id, second.id)
      await assert.rejects(bases.save(bases.create({ projectId, projectName: 'Renamed project' })), {
        code: '23505',
      })

      const documents = dataSource.getRepository(DocumentModel)
      const document = await documents.save(
        documents.create({
          sourceType: DocumentSourceTypeEnum.OBSIDIAN,
          sourceKey: randomUUID(),
          sourcePath: 'fresh-baseline.md',
          currentTitle: null,
          unreferencedSince: null,
        }),
      )
      assert.equal((await documents.findOneByOrFail({ id: document.id })).currentTitle, null)
      await documents.update(document.id, { currentTitle: 'Current title' })
      assert.equal((await documents.findOneByOrFail({ id: document.id })).currentTitle, 'Current title')

      const jobs = await runner.getTable(dataSource.driver.buildTableName('jobs', schema))
      const expiry = jobs?.columns.find(({ name }) => name === 'lease_expires_at')
      assert.ok(expiry)
      assert.equal(expiry.isNullable, true)
      const leaseExpiryIndex = jobs?.indices.find(({ name }) => name === 'idx_jobs_status_lease_expiry')
      assert.ok(leaseExpiryIndex)
      assert.deepEqual([...leaseExpiryIndex.columnNames].sort(), ['created_at', 'id', 'lease_expires_at', 'status'])
    } finally {
      await runner.release()
      await cleanup()
    }
  },
)
