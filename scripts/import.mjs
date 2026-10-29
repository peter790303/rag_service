import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import { NestFactory } from '@nestjs/core'
import 'reflect-metadata'

import { mergeDiscoveredEntries } from './import-entry-merge.mjs'
import { runWithDefaultManifestArchive } from './import-manifest-lifecycle.mjs'
import { parseImportOptions, shouldDiscoverVault } from './import-options.mjs'
import {
  discoverMarkdownEntries,
  isValidEntry,
  readSource,
  sourceType as obsidianSourceType,
} from './import-sources/obsidian-reader.mjs'
import { createDataSource } from '../dist/database/data-source.js'
import { loadObsidianImportCatalog } from '../dist/src/Infrastructure/Persistence/obsidian-import-catalog.js'
import { DocumentIndexImportCommand } from '../dist/src/Interfaces/Console/Commands/document-index-import-command.js'
import { DocumentIndexImportModule } from '../dist/src/Interfaces/Console/Commands/document-index-import.module.js'

const sourceReaders = new Map([[obsidianSourceType, { isValidEntry, readSource }]])
const { sourceType, manifestPath: manifestArgPath } = parseImportOptions(process.argv.slice(2))

const sourceReader = sourceReaders.get(sourceType)

if (!sourceReader) throw new Error(`Unsupported import source: ${sourceType}`)

const defaultManifestPath = resolve(process.env.RAG_IMPORT_MANIFEST ?? '.local/import-manifest.json')
const manifestPath = manifestArgPath ? resolve(manifestArgPath) : null

const readManifest = async (path) => {
  const manifest = JSON.parse(await readFile(path, 'utf8'))

  if (manifest.version !== 1 || !Array.isArray(manifest.entries)) {
    throw new Error(`Invalid or empty import manifest: ${path}`)
  }

  const entries = manifest.entries.filter((entry) => entry.sourceType === sourceType)

  if (entries.length === 0) {
    throw new Error(`Import manifest has no ${sourceType} mappings: ${path}`)
  }

  if (!entries.every(sourceReader.isValidEntry))
    throw new Error(`Invalid ${sourceType} mapping in import manifest: ${path}`)

  return entries
}

const includeDiscoveredMarkdown = async (entries, explicitManifest = false) => {
  if (
    !shouldDiscoverVault({
      sourceType,
      configuredRoot: process.env.OBSIDIAN_ROOT,
      explicitManifest,
    })
  )
    return entries

  const discovered = await discoverMarkdownEntries({
    vaultPath: process.env.OBSIDIAN_ROOT,
    projectId: process.env.RAG_OBSIDIAN_PROJECT_ID,
    projectName: process.env.RAG_OBSIDIAN_PROJECT_NAME,
  })

  return mergeDiscoveredEntries(entries, discovered)
}

const loadEntries = async () => {
  if (manifestPath)
    return {
      entries: await includeDiscoveredMarkdown(await readManifest(manifestPath), true),
      isDefaultManifest: false,
    }

  try {
    return {
      entries: await includeDiscoveredMarkdown(await readManifest(defaultManifestPath)),
      isDefaultManifest: true,
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  const dataSource = createDataSource()
  try {
    await dataSource.initialize()
    const entries = sourceType === obsidianSourceType ? await loadObsidianImportCatalog(dataSource.manager) : []

    if (entries.length > 0) {
      if (!entries.every(sourceReader.isValidEntry))
        throw new Error(`Live ${sourceType} catalog contains invalid mappings`)

      return { entries: await includeDiscoveredMarkdown(entries), isDefaultManifest: false }
    }

    if (sourceType === obsidianSourceType && process.env.OBSIDIAN_ROOT) {
      const discovered = await discoverMarkdownEntries({
        vaultPath: process.env.OBSIDIAN_ROOT,
        projectId: process.env.RAG_OBSIDIAN_PROJECT_ID,
        projectName: process.env.RAG_OBSIDIAN_PROJECT_NAME,
      })

      if (discovered.every(sourceReader.isValidEntry)) return { entries: discovered, isDefaultManifest: false }

      throw new Error('Obsidian vault discovery produced invalid mappings')
    }
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy()
  }

  throw new Error(`No ${sourceType} mappings found in the live catalog or default manifest`)
}

const run = async () => {
  const { entries, isDefaultManifest } = await loadEntries()
  const preparedEntries = await Promise.all(
    entries.map(async (entry) => ({
      entry,
      content: await sourceReader.readSource(entry),
    })),
  )

  const batches = Array.from({ length: Math.ceil(preparedEntries.length / 8) }, (_, index) =>
    preparedEntries.slice(index * 8, index * 8 + 8),
  )

  const timeoutMs = Number(process.env.RAG_IMPORT_TIMEOUT_MS ?? 21_600_000)

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error('RAG_IMPORT_TIMEOUT_MS must be a positive integer')

  await runWithDefaultManifestArchive(
    async () => {
      const originalAuthSecret = process.env.RAG_SERVICE_AUTH_SECRET
      process.env.RAG_SERVICE_AUTH_SECRET ||= randomBytes(32).toString('hex')
      let app

      try {
        app = await NestFactory.createApplicationContext(DocumentIndexImportModule, { logger: false })
        const command = app.get(DocumentIndexImportCommand)
        const completed = await batches.reduce(
          (previous, batch) =>
            previous.then(async (completedSoFar) => {
              await Promise.all(
                batch.map(async ({ entry, content }) =>
                  command.requestAndWait(
                    {
                      knowledgeBaseId: entry.knowledgeBaseId,
                      projectId: entry.projectId,
                      projectName: entry.projectName,
                      sourceType,
                      sourceKey: entry.sourceKey,
                      sourcePath: entry.sourcePath,
                      title: entry.title ?? undefined,
                      content,
                      payload: entry.payload,
                      isEntry: entry.isEntry,
                      alwaysIncludeFullContent: entry.alwaysIncludeFullContent,
                    },
                    timeoutMs,
                  ),
                ),
              )

              return completedSoFar + batch.length
            }),
          Promise.resolve(0),
        )
        process.stdout.write(`Imported ${completed} ${sourceType} knowledge-base memberships successfully.\n`)
      } finally {
        if (app) await app.close()

        if (originalAuthSecret === undefined) delete process.env.RAG_SERVICE_AUTH_SECRET
        else process.env.RAG_SERVICE_AUTH_SECRET = originalAuthSecret
      }
    },
    defaultManifestPath,
    isDefaultManifest,
  )
}

try {
  await run()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
