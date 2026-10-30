import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

import { createDataSource } from '../dist/src/Shared/Infrastructure/Persistence/TypeORM/DataSource.js'
import { resetRagDatabase } from '../dist/src/Shared/Infrastructure/Persistence/TypeORM/reset-rag-database.js'

const manifestPath = resolve(process.env.RAG_IMPORT_MANIFEST ?? '.local/import-manifest.json')
const dataSource = createDataSource()

try {
  await dataSource.initialize()
  const queryRunner = dataSource.createQueryRunner()
  try {
    const entryCount = await resetRagDatabase(queryRunner, async (entries) => {
      await mkdir(dirname(manifestPath), { recursive: true })
      const temporaryPath = `${manifestPath}.${process.pid}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, { mode: 0o600 })
      await rename(temporaryPath, manifestPath)
    })
    process.stdout.write(`RAG database data reset completed; preserved ${entryCount} current import mappings.`)
    process.stdout.write(
      entryCount > 0
        ? ` Manifest updated at ${manifestPath}.\n`
        : ` Existing manifest was left unchanged at ${manifestPath}.\n`,
    )
  } finally {
    await queryRunner.release()
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  if (dataSource.isInitialized) await dataSource.destroy()
}
