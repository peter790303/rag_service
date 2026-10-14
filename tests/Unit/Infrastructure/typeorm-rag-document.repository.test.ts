import assert from 'node:assert/strict'
import test from 'node:test'

import type { Repository } from 'typeorm'

import { RagDocumentModel } from '../../../src/Infrastructure/Persistence/Models/rag-document.model.js'
import { TypeOrmRagDocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-document.repository.js'

type InsertValues = {
  sourceType: string
  sourceKey: string
  sourcePath: string
  unreferencedSince: Date | null
  currentTitle?: string | null
}

const createDocumentRepository = (document: RagDocumentModel) => {
  let values: InsertValues | undefined
  let ignored = false
  let update: { overwrite: string[]; conflictTarget: string[] } | undefined

  const builder = {
    insert: () => builder,
    into: () => builder,
    values: (insertValues: InsertValues) => {
      values = insertValues

      return builder
    },
    orIgnore: () => {
      ignored = true

      return builder
    },
    orUpdate: (overwrite: string[], conflictTarget: string[]) => {
      update = { overwrite, conflictTarget }

      return builder
    },
    execute: async () => undefined,
  }

  const repository = {
    createQueryBuilder: () => builder,
    findOneByOrFail: async () => document,
  } as unknown as Repository<RagDocumentModel>

  return {
    repository,
    values: () => values,
    wasIgnored: () => ignored,
    update: () => update,
  }
}

test('ensureSource preserves an existing title when no title is supplied', async () => {
  const document = { id: 'document-1', currentTitle: 'latest title' } as RagDocumentModel
  const mock = createDocumentRepository(document)
  const repository = new TypeOrmRagDocumentRepository(mock.repository)

  const result = await repository.ensureSource('repository', 'repo-a', 'docs/page.md')

  assert.equal(result, document)
  assert.deepEqual(mock.values(), {
    sourceType: 'repository',
    sourceKey: 'repo-a',
    sourcePath: 'docs/page.md',
    unreferencedSince: null,
  })
  assert.equal(mock.wasIgnored(), false)
  assert.deepEqual(mock.update(), {
    overwrite: ['source_path', 'unreferenced_since'],
    conflictTarget: ['source_type', 'source_key', 'source_path'],
  })
})

test('ensureSource updates the mutable title while keeping the source identity conflict target', async () => {
  const document = { id: 'document-1', currentTitle: 'renamed title' } as RagDocumentModel
  const mock = createDocumentRepository(document)
  const repository = new TypeOrmRagDocumentRepository(mock.repository)

  const result = await repository.ensureSource('repository', 'repo-a', 'docs/page.md', 'renamed title')

  assert.equal(result, document)
  assert.deepEqual(mock.values(), {
    sourceType: 'repository',
    sourceKey: 'repo-a',
    sourcePath: 'docs/page.md',
    unreferencedSince: null,
    currentTitle: 'renamed title',
  })
  assert.deepEqual(mock.update(), {
    overwrite: ['source_path', 'current_title', 'unreferenced_since'],
    conflictTarget: ['source_type', 'source_key', 'source_path'],
  })
  assert.equal(mock.wasIgnored(), false)
})

test('ensureSource treats an explicit null title as a request to clear it', async () => {
  const document = { id: 'document-1', currentTitle: null } as RagDocumentModel
  const mock = createDocumentRepository(document)
  const repository = new TypeOrmRagDocumentRepository(mock.repository)

  await repository.ensureSource('repository', 'repo-a', 'docs/page.md', null)

  assert.equal(mock.values()?.unreferencedSince, null)
  assert.equal(mock.values()?.currentTitle, null)
  assert.deepEqual(mock.update(), {
    overwrite: ['source_path', 'current_title', 'unreferenced_since'],
    conflictTarget: ['source_type', 'source_key', 'source_path'],
  })
})
