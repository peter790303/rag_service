import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { createManifestUseCase, manifestFixture } from './load-index-manifest.fixture.ts'
import { IndexManifestResource } from '../../../src/DocumentIndexes/Interfaces/Nest/Resources/index-manifest.resource.ts'
import { LoadIndexManifestAssembler } from '../../../src/KnowledgeBases/Application/Assemblers/load-index-manifest.assembler.ts'
import {
  KnowledgeBaseIndexManifest,
  type IndexManifestDocument,
} from '../../../src/KnowledgeBases/Domain/ValueObjects/knowledge-base-index-manifest.ts'

test('manifest enumerates all persisted memberships beyond the graph limit, including unindexed documents', async () => {
  const manifestSnapshotFixture = manifestFixture(105)
  manifestSnapshotFixture.knowledgeBaseDocuments[1] = {
    ...manifestSnapshotFixture.knowledgeBaseDocuments[1]!,
    activeDocumentIndexId: null,
  }
  manifestSnapshotFixture.indexes.push({
    ...manifestSnapshotFixture.indexes[0]!,
    id: 'newer-inactive-index',
    revisionId: 'inactive-revision',
  })
  manifestSnapshotFixture.knowledgeBaseDocuments.push({
    knowledgeBaseId: 'foreign-kb',
    documentId: 'foreign-document',
    activeDocumentIndexId: 'foreign-index',
  })
  const { useCase, reads } = createManifestUseCase(manifestSnapshotFixture)
  const knowledgeBase = await useCase.execute({ projectId: 'project' })
  assert.ok(knowledgeBase)
  const body = IndexManifestResource.fromKnowledgeBase(knowledgeBase)
  assert.equal(body.complete, true)
  assert.equal(body.totalDocuments, 105)
  assert.equal(body.readyDocuments, 104)
  assert.equal(body.documents[0]?.requestedGeneration, '9007199254740993')
  assert.equal(body.documents[0]?.activeIndex?.documentIndexId, 'index-0')
  assert.deepEqual(body.documents[1]?.issues, ['no_active_index'])
  assert.equal(body.documents[1]?.activeIndex, null)
  assert.ok(!JSON.stringify(body).includes('PRIVATE CONTENT'))
  assert.ok(!JSON.stringify(body).includes('foreign-document'))
  assert.deepEqual(reads.find((read) => read.kind === 'memberships')?.request, { knowledgeBaseId: 'kb' })
  const revisionRequest = reads.find((read) => read.kind === 'revisions')?.request as { revisionIds: string[] }
  assert.equal(revisionRequest.revisionIds.length, 104)
  assert.ok(!revisionRequest.revisionIds.includes('inactive-revision'))
})

test('manifest reports broken references without substituting or exposing a foreign index/revision', async () => {
  const manifestSnapshotFixture = manifestFixture(6)
  manifestSnapshotFixture.documents = manifestSnapshotFixture.documents.filter((document) => document.id !== 'doc-1')
  manifestSnapshotFixture.indexes = manifestSnapshotFixture.indexes.filter((index) => index.id !== 'index-2')
  manifestSnapshotFixture.indexes.find((index) => index.id === 'index-3')!.readyAt = null
  manifestSnapshotFixture.indexes.find((index) => index.id === 'index-4')!.documentId = 'foreign-document'
  manifestSnapshotFixture.indexes.find((index) => index.id === 'index-4')!.embeddingModel = 'PRIVATE MODEL'
  manifestSnapshotFixture.revisions = manifestSnapshotFixture.revisions.map((revision) =>
    revision.id === 'revision-5'
      ? { ...revision, documentId: 'foreign-document', contentSha256: 'c'.repeat(64) }
      : revision,
  )
  const manifest = (await createManifestUseCase(manifestSnapshotFixture).useCase.execute({ projectId: 'project' }))
    ?.indexManifest
  assert.ok(manifest)
  assert.equal(manifest.documents.length, 6)
  assert.equal(manifest.readyDocuments, 1)
  assert.deepEqual(
    manifest.documents.map((document) => document.issues),
    [
      [],
      ['document_unavailable'],
      ['active_index_unavailable'],
      ['index_not_ready'],
      ['active_index_unavailable'],
      ['revision_unavailable'],
    ],
  )
  assert.equal(manifest.documents[4]?.activeIndex, null)
  assert.equal(manifest.documents[5]?.activeIndex?.contentSha256, null)
  assert.ok(!JSON.stringify(manifest).includes('PRIVATE MODEL'))
  assert.ok(!JSON.stringify(manifest).includes('c'.repeat(64)))
})

test('known empty project has a complete stable empty manifest; missing project performs no member reads', async () => {
  const { useCase } = createManifestUseCase(manifestFixture(0))
  const first = await useCase.execute({ projectId: 'project' })
  assert.ok(first)
  const body = IndexManifestResource.fromKnowledgeBase(first)
  assert.equal(body.totalDocuments, 0)
  assert.equal(body.readyDocuments, 0)
  assert.equal(body.complete, true)
  assert.deepEqual(body.documents, [])
  assert.equal(body.activeIndexDigest.value, '781bc5dc84a399a50841bfd722517b8490069d1b82f76e725145d0d1358024c9')
  assert.equal(
    (await useCase.execute({ projectId: 'project' }))?.indexManifest?.activeIndexDigest,
    body.activeIndexDigest.value,
  )
  const missing = createManifestUseCase({ ...manifestFixture(), knowledgeBaseId: null })
  assert.equal(await missing.useCase.execute({ projectId: 'project' }), null)
  assert.deepEqual(
    missing.reads.map((read) => read.kind),
    ['knowledgeBase'],
  )
  await assert.rejects(useCase.execute({ projectId: 'another-project' }))
})

test('manifest digest version 1 matches the independently calculated canonical tuple fixture', async () => {
  const manifest = (await createManifestUseCase().useCase.execute({ projectId: 'project' }))!.indexManifest!
  assert.equal(manifest.activeIndexDigest, 'cfff14769e905211cca1accec3e1164af422e760b980c72198aa765c86746082')
})

test('versioned digest is independent of repository ordering and sensitive to active identity, content, profile and memberships', async () => {
  const manifestSnapshotFixture = manifestFixture(2)
  const manifest = (await createManifestUseCase(manifestSnapshotFixture).useCase.execute({ projectId: 'project' }))!
    .indexManifest!
  const shuffled = {
    ...manifestSnapshotFixture,
    knowledgeBaseDocuments: [...manifestSnapshotFixture.knowledgeBaseDocuments].reverse(),
    indexes: [...manifestSnapshotFixture.indexes].reverse(),
  }
  const reordered = (await createManifestUseCase(shuffled).useCase.execute({ projectId: 'project' }))!.indexManifest!
  assert.equal(reordered.activeIndexDigest, manifest.activeIndexDigest)
  const digestIndexManifest = (projectId: string, documents: readonly IndexManifestDocument[]): string =>
    createHash('sha256')
      .update(LoadIndexManifestAssembler.serializeIndexManifestHashInput(projectId, documents), 'utf8')
      .digest('hex')
  const document = manifest.documents[0]!
  const index = document.activeIndex!
  const mutations = [
    { ...document, requestedGeneration: '9007199254740994' },
    { ...document, isEntry: true },
    { ...document, alwaysIncludeFullContent: true },
    { ...document, activeDocumentIndexId: 'new-index', activeIndex: { ...index, documentIndexId: 'new-index' } },
    { ...document, activeIndex: { ...index, revisionId: 'new-revision' } },
    { ...document, activeIndex: { ...index, contentSha256: 'd'.repeat(64) } },
    { ...document, activeIndex: { ...index, pipelineHash: 'e'.repeat(64) } },
    ...Object.keys(index.profile).map((key) => ({
      ...document,
      activeIndex: { ...index, profile: { ...index.profile, [key]: key === 'embeddingDimensions' ? 768 : 'changed' } },
    })),
  ]
  mutations.forEach((changed) =>
    assert.notEqual(digestIndexManifest('project', [changed, manifest.documents[1]!]), manifest.activeIndexDigest),
  )
  assert.notEqual(digestIndexManifest('project', [document]), manifest.activeIndexDigest)
  assert.notEqual(digestIndexManifest('other-project', manifest.documents), manifest.activeIndexDigest)
  assert.equal(
    digestIndexManifest('project', [{ ...document, title: 'Only a label change' }, manifest.documents[1]!]),
    manifest.activeIndexDigest,
  )
  assert.ok(Object.isFrozen(manifest.documents[0]?.activeIndex?.profile))
  assert.throws(() => new KnowledgeBaseIndexManifest([document, document], manifest.activeIndexDigest))
})
