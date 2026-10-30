import assert from 'node:assert/strict'

import { createRepositoryStub } from './document-index-lifecycle.fixture.ts'
import {
  createRetrievalSnapshotFixture,
  type RetrievalSnapshotFixture,
} from './retrieve-knowledge-base-content.use-case.fixtures.ts'
import { LoadIndexManifestQueryHandler } from '../../../src/KnowledgeBases/Application/Queries/load-index-manifest.query.handler.ts'

export const manifestFixture = (count: number = 1): RetrievalSnapshotFixture => ({
  knowledgeBaseId: 'kb',
  knowledgeBaseDocuments: Array.from({ length: count }, (_, n) => ({
    documentId: `doc-${n}`,
    activeDocumentIndexId: `index-${n}`,
    requestedGeneration: '9007199254740993',
  })),
  documents: Array.from({ length: count }, (_, n) => ({ id: `doc-${n}`, sourcePath: `docs/${n}.md` })),
  indexes: Array.from({ length: count }, (_, n) => ({
    id: `index-${n}`,
    documentId: `doc-${n}`,
    revisionId: `revision-${n}`,
    pipelineHash: 'b'.repeat(64),
    chunkingModel: 'chunker',
    chunkingProfile: 'chunk-v1',
    embeddingModel: 'embedder',
    embeddingDimensions: 384,
    embeddingProfile: 'embed-v1',
    lexicalProfile: 'lex-v1',
    relationProfile: 'relation-v1',
  })),
  revisions: Array.from({ length: count }, (_, n) => ({ id: `revision-${n}`, content: 'PRIVATE CONTENT' })),
  chunks: [],
  relations: [],
})

type ManifestUseCaseFixture = {
  useCase: LoadIndexManifestQueryHandler
  reads: { kind: string; request: unknown }[]
}

export const createManifestUseCase = (
  manifestSnapshotFixture: RetrievalSnapshotFixture = manifestFixture(),
): ManifestUseCaseFixture => {
  const snapshot = createRetrievalSnapshotFixture(manifestSnapshotFixture)
  let snapshotActive = false
  const reads: { kind: string; request: unknown }[] = []
  const read = <T>(kind: string, request: unknown, value: T): T => {
    assert.ok(snapshotActive, `${kind} must be read inside the snapshot`)
    reads.push({ kind, request })

    return value
  }
  type Dependencies = ConstructorParameters<typeof LoadIndexManifestQueryHandler>
  const useCase = new LoadIndexManifestQueryHandler(
    {
      run: async () => assert.fail('Manifest must never open a write transaction'),
      runReadOnlySnapshot: async (operation) => {
        snapshotActive = true
        try {
          return await operation()
        } finally {
          snapshotActive = false
        }
      },
    },
    createRepositoryStub<Dependencies[1]>({
      findByProjectId: async (knowledgeBaseProjectQO) =>
        read('knowledgeBase', knowledgeBaseProjectQO, snapshot.knowledgeBase),
    }),
    { execute: async (loadMembershipsDTO) => read('memberships', loadMembershipsDTO, snapshot.knowledgeBaseDocuments) },
    { execute: async (loadDocumentsDTO) => read('documents', loadDocumentsDTO, snapshot.documents) },
    { execute: async (loadIndexesDTO) => read('indexes', loadIndexesDTO, snapshot.indexes) },
    { execute: async (loadRevisionsDTO) => read('revisions', loadRevisionsDTO, snapshot.revisions) },
  )

  return { useCase, reads }
}
