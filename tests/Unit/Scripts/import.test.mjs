import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { mergeDiscoveredEntries } from '../../../scripts/import-entry-merge.mjs'
import { runWithDefaultManifestArchive } from '../../../scripts/import-manifest-lifecycle.mjs'
import { parseImportOptions, shouldDiscoverVault } from '../../../scripts/import-options.mjs'
import { discoverMarkdownEntries, isValidEntry, readSource } from '../../../scripts/import-sources/obsidian-reader.mjs'

test('import CLI accepts positional source and the legacy --source option', () => {
  assert.deepEqual(parseImportOptions(['obsidian']), { sourceType: 'obsidian', manifestPath: null })
  assert.deepEqual(parseImportOptions(['obsidian', '--manifest', 'snapshot.json']), {
    sourceType: 'obsidian',
    manifestPath: 'snapshot.json',
  })
  assert.deepEqual(parseImportOptions(['--source', 'obsidian']), {
    sourceType: 'obsidian',
    manifestPath: null,
  })
  assert.deepEqual(parseImportOptions(['--manifest', 'snapshot.json', 'obsidian']), {
    sourceType: 'obsidian',
    manifestPath: 'snapshot.json',
  })
  assert.deepEqual(parseImportOptions(['--manifest', 'snapshot.json', '--source', 'obsidian']), {
    sourceType: 'obsidian',
    manifestPath: 'snapshot.json',
  })
})

test('only default Obsidian imports extend mappings with vault discovery', () => {
  assert.equal(shouldDiscoverVault({ sourceType: 'obsidian', configuredRoot: '/vault', explicitManifest: false }), true)
  assert.equal(shouldDiscoverVault({ sourceType: 'obsidian', configuredRoot: '/vault', explicitManifest: true }), false)
  assert.equal(shouldDiscoverVault({ sourceType: 'json', configuredRoot: '/vault', explicitManifest: false }), false)
})

test('successful default-manifest import archives the snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rag-import-manifest-'))
  const manifestPath = join(root, 'import-manifest.json')
  try {
    await writeFile(manifestPath, '{"entries":[]}')
    const result = await runWithDefaultManifestArchive(async () => 'done', manifestPath, true)

    assert.equal(result, 'done')
    assert.equal(await readFile(`${manifestPath}.completed`, 'utf8'), '{"entries":[]}')
    await assert.rejects(readFile(manifestPath, 'utf8'), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('failed import leaves the default manifest active and explicit manifest is never archived', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rag-import-manifest-'))
  const manifestPath = join(root, 'import-manifest.json')
  try {
    await writeFile(manifestPath, '{"entries":[]}')
    await assert.rejects(
      runWithDefaultManifestArchive(
        async () => {
          throw new Error('import failed')
        },
        manifestPath,
        true,
      ),
      /import failed/,
    )
    assert.equal(await readFile(manifestPath, 'utf8'), '{"entries":[]}')

    await runWithDefaultManifestArchive(async () => undefined, manifestPath, false)
    assert.equal(await readFile(manifestPath, 'utf8'), '{"entries":[]}')
    await assert.rejects(readFile(`${manifestPath}.completed`, 'utf8'), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Obsidian reader reads the same current source for distinct KB memberships', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rag-import-'))
  try {
    const sourcePath = 'notes/example.md'
    await mkdir(join(root, 'notes'))
    await writeFile(join(root, sourcePath), '# Current vault content\n')
    const baseEntry = {
      sourceType: 'obsidian',
      projectId: 'project-1',
      projectName: 'Project',
      sourceKey: root,
      sourcePath,
      title: 'Example',
      isEntry: false,
      alwaysIncludeFullContent: false,
    }
    const memberships = [
      { ...baseEntry, knowledgeBaseId: 'kb-1', isEntry: true },
      { ...baseEntry, knowledgeBaseId: 'kb-2', alwaysIncludeFullContent: true },
    ]

    assert.ok(memberships.every(isValidEntry))
    assert.deepEqual(await Promise.all(memberships.map(readSource)), [
      '# Current vault content\n',
      '# Current vault content\n',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Obsidian discovery groups files by nearest CONTEXT.md and falls back outside project roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rag-obsidian-discovery-'))
  try {
    await mkdir(join(root, 'notes', '.hidden'), { recursive: true })
    await mkdir(join(root, 'BackEnd', 'Agent-Teams', 'docs'), { recursive: true })
    await mkdir(join(root, 'BackEnd', 'Rag-Service', 'docs'), { recursive: true })
    await mkdir(join(root, 'Collision', 'Foo_Bar'), { recursive: true })
    await mkdir(join(root, 'Collision', 'Foo Bar'), { recursive: true })
    await mkdir(join(root, '.obsidian'), { recursive: true })
    await mkdir(join(root, '.git', 'notes'), { recursive: true })
    await mkdir(join(root, '.linked-dir'))
    await writeFile(join(root, 'README.md'), '# Worker\n')
    await writeFile(join(root, 'BackEnd', 'Agent-Teams', 'CONTEXT.md'), '# Agent Teams\n')
    await writeFile(join(root, 'BackEnd', 'Agent-Teams', 'docs', 'guide.md'), '# Guide\n')
    await writeFile(join(root, 'BackEnd', 'Rag-Service', 'CONTEXT.md'), '# Rag Service\n')
    await writeFile(join(root, 'BackEnd', 'Rag-Service', 'docs', 'api.md'), '# API\n')
    await writeFile(join(root, 'Collision', 'Foo_Bar', 'CONTEXT.md'), '# underscore\n')
    await writeFile(join(root, 'Collision', 'Foo Bar', 'CONTEXT.md'), '# space\n')
    await writeFile(join(root, 'Collision', 'Foo_Bar', 'page.md'), '# underscore page\n')
    await writeFile(join(root, 'Collision', 'Foo Bar', 'page.md'), '# space page\n')
    await writeFile(join(root, 'notes', 'page.MD'), '# Page\n')
    await writeFile(join(root, '.obsidian', 'app.md'), 'private config')
    await writeFile(join(root, '.git', 'notes', 'history.md'), 'history')
    await writeFile(join(root, 'notes', '.hidden', 'secret.md'), 'hidden')
    await writeFile(join(root, 'notes', 'skip.txt'), 'not markdown')
    await writeFile(join(root, '.linked-dir', 'external.md'), 'linked directory target')
    await symlink(join(root, 'notes', 'page.MD'), join(root, 'linked-file.md'))
    await symlink(join(root, '.linked-dir'), join(root, 'notes', 'linked-dir'))

    const first = await discoverMarkdownEntries({ vaultPath: root })
    const second = await discoverMarkdownEntries({ vaultPath: root })
    const byPath = new Map(first.map((entry) => [entry.sourcePath, entry]))

    assert.deepEqual(
      first.map(({ sourcePath }) => sourcePath),
      [
        'BackEnd/Agent-Teams/CONTEXT.md',
        'BackEnd/Agent-Teams/docs/guide.md',
        'BackEnd/Rag-Service/CONTEXT.md',
        'BackEnd/Rag-Service/docs/api.md',
        'Collision/Foo Bar/CONTEXT.md',
        'Collision/Foo Bar/page.md',
        'Collision/Foo_Bar/CONTEXT.md',
        'Collision/Foo_Bar/page.md',
        'README.md',
        'notes/page.MD',
      ],
    )
    assert.ok(first.every(isValidEntry))
    assert.equal(byPath.get('BackEnd/Agent-Teams/docs/guide.md').projectName, 'Agent-Teams')
    assert.match(
      byPath.get('BackEnd/Agent-Teams/docs/guide.md').projectId,
      /^worker\/backend\/agent-teams-[a-f0-9]{16}$/,
    )
    assert.equal(byPath.get('BackEnd/Rag-Service/docs/api.md').projectName, 'Rag-Service')
    assert.match(byPath.get('BackEnd/Rag-Service/docs/api.md').projectId, /^worker\/backend\/rag-service-[a-f0-9]{16}$/)
    assert.notEqual(
      byPath.get('Collision/Foo_Bar/page.md').projectId,
      byPath.get('Collision/Foo Bar/page.md').projectId,
    )
    assert.equal(byPath.get('README.md').projectId, 'worker/obsidian-worker')
    assert.equal(
      byPath.get('README.md').knowledgeBaseId,
      second.find((entry) => entry.sourcePath === 'README.md').knowledgeBaseId,
    )
    assert.deepEqual(first, second)

    await writeFile(join(root, 'notes', 'added.md'), '# Later addition\n')
    const laterScan = await discoverMarkdownEntries({ vaultPath: root })
    assert.equal(laterScan.length, first.length + 1)
    const added = laterScan.find((entry) => entry.sourcePath === 'notes/added.md')
    assert.ok(added)
    assert.equal(added.knowledgeBaseId, byPath.get('README.md').knowledgeBaseId)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('CONTEXT.md project frontmatter defines the canonical project identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rag-obsidian-project-id-'))
  try {
    await mkdir(join(root, 'BackEnd', 'Agent-Teams-Web'), { recursive: true })
    await mkdir(join(root, 'BackEnd', 'CodingPipeline'), { recursive: true })
    await writeFile(
      join(root, 'BackEnd', 'Agent-Teams-Web', 'CONTEXT.md'),
      '---\nproject: agent-teams-web\n---\n# Agent Teams Web\n',
    )
    await writeFile(
      join(root, 'BackEnd', 'CodingPipeline', 'CONTEXT.md'),
      '---\nproject: CodingPipeline\n---\n# CodingPipeline\n',
    )
    await writeFile(join(root, 'BackEnd', 'Agent-Teams-Web', 'guide.md'), '# Guide')
    await writeFile(join(root, 'BackEnd', 'CodingPipeline', 'guide.md'), '# Guide')
    await writeFile(join(root, 'unassigned.md'), '# Unassigned')

    const entries = await discoverMarkdownEntries({ vaultPath: root })
    const byPath = new Map(entries.map((entry) => [entry.sourcePath, entry]))

    assert.equal(byPath.get('BackEnd/Agent-Teams-Web/guide.md').projectId, 'agent-teams-web')
    assert.equal(byPath.get('BackEnd/Agent-Teams-Web/guide.md').projectName, 'Agent-Teams-Web')
    assert.equal(byPath.get('BackEnd/CodingPipeline/guide.md').projectId, 'CodingPipeline')
    assert.notEqual(
      byPath.get('BackEnd/Agent-Teams-Web/guide.md').knowledgeBaseId,
      byPath.get('BackEnd/CodingPipeline/guide.md').knowledgeBaseId,
    )
    assert.equal(byPath.get('unassigned.md').projectId, 'worker/obsidian-worker')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('duplicate CONTEXT.md project ids across directories fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rag-obsidian-project-collision-'))
  try {
    await mkdir(join(root, 'one'), { recursive: true })
    await mkdir(join(root, 'two'), { recursive: true })
    await writeFile(join(root, 'one', 'CONTEXT.md'), '---\nproject: shared-id\n---\n')
    await writeFile(join(root, 'two', 'CONTEXT.md'), '---\nproject: shared-id\n---\n')
    await writeFile(join(root, 'one', 'page.md'), '# one')
    await writeFile(join(root, 'two', 'page.md'), '# two')

    await assert.rejects(discoverMarkdownEntries({ vaultPath: root }), /Duplicate CONTEXT.md project id/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blank CONTEXT.md project metadata fails closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rag-obsidian-empty-project-'))
  try {
    await writeFile(join(root, 'CONTEXT.md'), '---\nproject: " "\n---\n')
    await writeFile(join(root, 'page.md'), '# Page')

    await assert.rejects(discoverMarkdownEntries({ vaultPath: root }), /CONTEXT.md project must be a non-empty string/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('malformed CONTEXT.md frontmatter fails closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rag-obsidian-malformed-frontmatter-'))
  try {
    await writeFile(join(root, 'CONTEXT.md'), '---\nproject: unfinished\n')
    await writeFile(join(root, 'page.md'), '# Page')

    await assert.rejects(discoverMarkdownEntries({ vaultPath: root }), /Invalid YAML frontmatter in CONTEXT.md/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Obsidian discovery supports configured fallback identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rag-obsidian-discovery-'))
  try {
    await writeFile(join(root, 'known.md'), 'known')
    await writeFile(join(root, 'new.md'), 'new')
    const existing = {
      sourceType: 'obsidian',
      projectId: 'existing-project',
      projectName: 'Existing project',
      knowledgeBaseId: '75b79489-6192-4a20-9fae-b5a2a55b1234',
      sourceKey: root,
      sourcePath: 'known.md',
      title: 'Known',
      isEntry: true,
      alwaysIncludeFullContent: true,
    }
    const discovered = await discoverMarkdownEntries({
      vaultPath: root,
      projectId: 'custom/project',
      projectName: 'Custom project',
    })

    assert.equal(discovered.length, 2)
    assert.equal(discovered[0].projectId, 'custom/project')
    assert.equal(discovered[0].projectName, 'Custom project')
    assert.notEqual(discovered[0].knowledgeBaseId, existing.knowledgeBaseId)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('discovered grouping replaces matching fallback identity, preserves metadata, and retains other manifests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rag-obsidian-merge-'))
  try {
    await mkdir(join(root, 'BackEnd', 'Agent-Teams'), { recursive: true })
    await writeFile(join(root, 'BackEnd', 'Agent-Teams', 'CONTEXT.md'), '# context')
    await writeFile(join(root, 'BackEnd', 'Agent-Teams', 'guide.md'), '# guide')
    const existing = {
      sourceType: 'obsidian',
      projectId: 'worker/obsidian-worker',
      projectName: 'Worker Obsidian',
      knowledgeBaseId: '75b79489-6192-4a20-9fae-b5a2a55b1234',
      sourceKey: root,
      sourcePath: 'BackEnd/Agent-Teams/guide.md',
      title: 'Curated title',
      payload: { category: 'guide' },
      isEntry: true,
      alwaysIncludeFullContent: true,
    }
    const discovered = await discoverMarkdownEntries({ vaultPath: root })
    const merged = mergeDiscoveredEntries([existing], discovered)
    const guide = merged.find((entry) => entry.sourcePath === existing.sourcePath)

    assert.match(guide.projectId, /^worker\/backend\/agent-teams-[a-f0-9]{16}$/)
    assert.equal(guide.projectName, 'Agent-Teams')
    assert.notEqual(guide.knowledgeBaseId, existing.knowledgeBaseId)
    assert.equal(guide.title, 'Curated title')
    assert.deepEqual(guide.payload, { category: 'guide' })
    assert.equal(guide.isEntry, true)
    assert.equal(guide.alwaysIncludeFullContent, true)

    const unrelatedSource = { ...existing, sourceKey: `${root}-other`, title: 'Other vault' }
    const separateMerge = mergeDiscoveredEntries([unrelatedSource], discovered)
    assert.equal(separateMerge.length, discovered.length + 1)
    assert.equal(separateMerge.find((entry) => entry.sourceKey === unrelatedSource.sourceKey).title, 'Other vault')
    assert.equal(
      separateMerge.find((entry) => entry.sourceKey === root && entry.sourcePath === existing.sourcePath).title,
      'guide',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('discovery reuses an existing knowledge base id by canonical project id', () => {
  const projectEntry = {
    sourceType: 'obsidian',
    projectId: 'agent-teams-web',
    projectName: 'Agent-Teams-Web',
    knowledgeBaseId: '7acf1dff-663e-5455-9f85-31bc2110d26c',
    sourceKey: '/vault',
    sourcePath: 'BackEnd/Agent-Teams-Web/CONTEXT.md',
    title: 'CONTEXT',
    isEntry: false,
    alwaysIncludeFullContent: false,
  }
  const updatedProjectEntry = { ...projectEntry, knowledgeBaseId: 'derived-id' }
  const newProjectFile = {
    ...projectEntry,
    sourcePath: 'BackEnd/Agent-Teams-Web/new.md',
    knowledgeBaseId: 'derived-id',
  }
  const otherProject = {
    ...newProjectFile,
    projectId: 'another-project',
    knowledgeBaseId: 'another-derived-id',
  }

  const merged = mergeDiscoveredEntries([projectEntry], [updatedProjectEntry, newProjectFile, otherProject])

  assert.equal(
    merged.find((entry) => entry.sourcePath === projectEntry.sourcePath).knowledgeBaseId,
    projectEntry.knowledgeBaseId,
  )
  assert.equal(
    merged.find((entry) => entry.sourcePath === newProjectFile.sourcePath).knowledgeBaseId,
    projectEntry.knowledgeBaseId,
  )
  assert.equal(merged.find((entry) => entry.projectId === 'another-project').knowledgeBaseId, 'another-derived-id')
})

test('reassigned sources use the destination project knowledge base id', () => {
  const existingSource = {
    sourceType: 'obsidian',
    projectId: 'old-project',
    projectName: 'Old project',
    knowledgeBaseId: 'old-project-id',
    sourceKey: '/vault',
    sourcePath: 'BackEnd/Agent-Teams-Web/new.md',
    title: 'New document',
    isEntry: false,
    alwaysIncludeFullContent: false,
  }
  const existingDestinationProject = {
    ...existingSource,
    projectId: 'agent-teams-web',
    projectName: 'Agent-Teams-Web',
    knowledgeBaseId: 'destination-custom-id',
    sourcePath: 'BackEnd/Agent-Teams-Web/CONTEXT.md',
  }
  const discoveredSource = {
    ...existingSource,
    projectId: 'agent-teams-web',
    projectName: 'Agent-Teams-Web',
    knowledgeBaseId: 'new-derived-id',
  }

  const merged = mergeDiscoveredEntries([existingSource, existingDestinationProject], [discoveredSource])

  assert.equal(merged.find((entry) => entry.sourcePath === existingSource.sourcePath).projectId, 'agent-teams-web')
  assert.equal(
    merged.find((entry) => entry.sourcePath === existingSource.sourcePath).knowledgeBaseId,
    existingDestinationProject.knowledgeBaseId,
  )
})

test('a vault-root CONTEXT.md groups root and nested Markdown under the vault project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rag-obsidian-root-context-'))
  try {
    await mkdir(join(root, 'notes'), { recursive: true })
    await writeFile(join(root, 'CONTEXT.md'), '# Vault context')
    await writeFile(join(root, 'notes', 'page.md'), '# Page')

    const entries = await discoverMarkdownEntries({ vaultPath: root })

    assert.ok(entries.every((entry) => entry.projectId.startsWith('worker/root-')))
    assert.ok(entries.every((entry) => entry.projectName === 'Worker Obsidian'))
    assert.equal(entries[0].projectId, entries[1].projectId)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
