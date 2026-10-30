import {
  createDocumentFixture,
  createRepositoryStub,
  createRestoredKnowledgeBaseDocumentFixture,
  createRestoredDocumentIndexFixture,
} from './document-index-lifecycle.fixture.ts'
import type { FindLexicalChunkCandidatesQueryHandlerContract } from '../../../src/Chunks/Application/Contracts/find-lexical-chunk-candidates.query.handler.contract.ts'
import { FindRetrievalChunkCandidatesQueryHandler } from '../../../src/Chunks/Application/Queries/find-retrieval-chunk-candidates.query.handler.ts'
import { LoadRetrievalChunkContextQueryHandler } from '../../../src/Chunks/Application/Queries/load-retrieval-chunk-context.query.handler.ts'
import { LoadRetrievalIndexChunksQueryHandler } from '../../../src/Chunks/Application/Queries/load-retrieval-index-chunks.query.handler.ts'
import type {
  ChunkIndexOrdinalsQO,
  ChunkVectorSimilarityQO,
} from '../../../src/Chunks/Application/QueryObjects/chunk.query-object.ts'
import { Chunk, type ChunkState } from '../../../src/Chunks/Domain/Entities/chunk.ts'
import { LoadRetrievalDocumentIndexesQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/load-retrieval-document-indexes.query.handler.ts'
import type { DocumentIndexState } from '../../../src/DocumentIndexes/Domain/Entities/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { LoadRetrievalDocumentRelationsQueryHandler } from '../../../src/DocumentRelations/Application/Queries/load-retrieval-document-relations.query.handler.ts'
import {
  DocumentRelation,
  type DocumentRelationState,
} from '../../../src/DocumentRelations/Domain/Entities/document-relation.ts'
import { LoadRetrievalDocumentRevisionsQueryHandler } from '../../../src/DocumentRevisions/Application/Queries/load-retrieval-document-revisions.query.handler.ts'
import {
  DocumentRevision,
  type DocumentRevisionState,
} from '../../../src/DocumentRevisions/Domain/Entities/document-revision.ts'
import { LoadRetrievalDocumentsQueryHandler } from '../../../src/Documents/Application/Queries/load-retrieval-documents.query.handler.ts'
import type { DocumentState } from '../../../src/Documents/Domain/Entities/document.ts'
import { LoadRetrievalKnowledgeBaseDocumentsQueryHandler } from '../../../src/KnowledgeBaseDocuments/Application/Queries/load-retrieval-knowledge-base-documents.query.handler.ts'
import type { KnowledgeBaseDocumentState } from '../../../src/KnowledgeBaseDocuments/Domain/Entities/knowledge-base-document.ts'
import type { RetrieveKnowledgeBaseContentQueryHandler } from '../../../src/KnowledgeBases/Application/Queries/retrieve-knowledge-base-content.query.handler.ts'
import type { RetrievalSnapshot } from '../../../src/KnowledgeBases/Application/Types/retrieval-snapshot.ts'
import { KnowledgeBase } from '../../../src/KnowledgeBases/Domain/Entities/knowledge-base.ts'

export type RetrievalChunkFixture = Pick<ChunkState, 'id' | 'documentIndexId'> &
  Partial<Omit<ChunkState, 'id' | 'documentIndexId' | 'searchVector'>> & {
    searchVector?: string | readonly string[] | null
  }
export type RetrievalSnapshotFixture = {
  knowledgeBaseId: string | null
  knowledgeBaseDocuments: (Pick<KnowledgeBaseDocumentState, 'documentId'> & Partial<KnowledgeBaseDocumentState>)[]
  documents: (Pick<DocumentState, 'id'> & Partial<DocumentState>)[]
  chunks: RetrievalChunkFixture[]
  indexes: (Pick<DocumentIndexState, 'id' | 'documentId'> & Partial<DocumentIndexState>)[]
  revisions: (Pick<DocumentRevisionState, 'id'> & Partial<DocumentRevisionState> & { fullContent?: string | null })[]
  relations: (Pick<DocumentRelationState, 'id' | 'sourceIndexId'> & Partial<DocumentRelationState>)[]
}

export const createRetrievalChunkFixture = (state: RetrievalChunkFixture): Chunk =>
  new Chunk({
    ordinal: 0,
    headingPath: [],
    content: '',
    tokenCount: null,
    embedding: [],
    blockStart: 0,
    blockEnd: 0,
    createdAt: new Date(0),
    ...state,
    searchVector: typeof state.searchVector === 'string' ? state.searchVector : (state.searchVector?.join(' ') ?? null),
  })

export const createRetrievalSnapshotFixture = (input: RetrievalSnapshotFixture): RetrievalSnapshot => ({
  knowledgeBaseId: input.knowledgeBaseId,
  knowledgeBase:
    input.knowledgeBaseId === null
      ? null
      : KnowledgeBase.create({
          id: input.knowledgeBaseId,
          projectId: 'project',
          projectName: 'Project',
          createdAt: new Date(0),
          updatedAt: new Date(0),
        }),
  knowledgeBaseDocuments: input.knowledgeBaseDocuments.map((state) =>
    createRestoredKnowledgeBaseDocumentFixture({ knowledgeBaseId: input.knowledgeBaseId ?? 'kb', ...state }),
  ),
  documents: input.documents.map((state) =>
    createDocumentFixture({
      sourceType: 'repository',
      sourceKey: state.sourcePath ?? state.id,
      sourcePath: state.id,
      ...state,
    }),
  ),
  chunks: input.chunks.map(createRetrievalChunkFixture),
  indexes: input.indexes.map((state) =>
    createRestoredDocumentIndexFixture({
      status: state.readyAt === null ? DocumentIndexStatusEnum.BUILDING : DocumentIndexStatusEnum.READY,
      readyAt: new Date('2026-01-01T00:00:00.000Z'),
      ...state,
    }),
  ),
  revisions: input.revisions.map(
    (state) =>
      new DocumentRevision({
        documentId: input.indexes.find((index) => index.revisionId === state.id)?.documentId ?? 'document',
        contentSha256: 'a'.repeat(64),
        title: null,
        capturedAt: new Date(0),
        createdAt: new Date(0),
        ...state,
        content: state.content ?? state.fullContent ?? '',
      }),
  ),
  relations: input.relations.map(
    (state) =>
      new DocumentRelation({
        targetDocumentId: null,
        targetReference: 'target.md',
        targetAnchor: null,
        relationType: 'markdown_link',
        evidenceBlockStart: 0,
        evidenceBlockEnd: 0,
        evidenceText: '',
        ...state,
      }),
  ),
})

type RetrievalConstructor = ConstructorParameters<typeof RetrieveKnowledgeBaseContentQueryHandler>
type RetrievalPersistenceDependencies = [
  RetrievalConstructor[0],
  RetrievalConstructor[1],
  RetrievalConstructor[2],
  RetrievalConstructor[3],
  RetrievalConstructor[4],
  RetrievalConstructor[5],
  RetrievalConstructor[6],
  RetrievalConstructor[7],
  RetrievalConstructor[8],
  RetrievalConstructor[9],
]

export const createRetrievalPersistenceFixture = (
  snapshotInput: RetrievalSnapshotFixture,
  onLoad?: (knowledgeBaseProjectQO: { projectId: string }) => void,
  onContextQuery?: (chunkIndexOrdinalsQO: ChunkIndexOrdinalsQO) => void,
) => {
  const snapshot = createRetrievalSnapshotFixture(snapshotInput)
  let snapshotActive = false
  const calls: string[] = []
  const ownerCalls: { owner: string; input: unknown }[] = []
  const assertSnapshotActive = (name: string) => {
    if (!snapshotActive) throw new Error(`${name} read outside the snapshot`)
  }
  const withinSnapshot = (name: string) => {
    assertSnapshotActive(name)
    calls.push(name)
  }
  const traceOwner = <TInput, TOutput>(
    name: string,
    owner: { execute(ownerRequestDTO: TInput): Promise<TOutput> },
  ) => ({
    execute: async (ownerRequestDTO: TInput): Promise<TOutput> => {
      assertSnapshotActive(name)
      ownerCalls.push({ owner: name, input: ownerRequestDTO })

      return owner.execute(ownerRequestDTO)
    },
  })
  const chunkEntities = snapshot.chunks
  const lexicalCandidates: FindLexicalChunkCandidatesQueryHandlerContract = {
    execute: async (findLexicalChunkCandidatesDTO) => {
      withinSnapshot('lexical')
      const terms = findLexicalChunkCandidatesDTO.queryText.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
      const matching = chunkEntities
        .filter(
          (chunk) =>
            findLexicalChunkCandidatesDTO.documentIndexIds.includes(chunk.documentIndexId) &&
            terms.some((term) => chunk.content.toLocaleLowerCase().includes(term.toLocaleLowerCase())),
        )
        .slice(0, findLexicalChunkCandidatesDTO.limit)
      matching.forEach((chunk, index) => {
        chunk.recordLexicalSearchMatch(findLexicalChunkCandidatesDTO.queryText, 1 / (index + 1))
      })

      return matching
    },
  }
  const repositories = [
    {
      run: async () => {
        throw new Error('Retrieval must use the readonly snapshot boundary')
      },
      runReadOnlySnapshot: async <T>(operation: () => Promise<T>) => {
        calls.push('snapshot:start')
        snapshotActive = true
        try {
          return await operation()
        } finally {
          snapshotActive = false
          calls.push('snapshot:end')
        }
      },
    },
    {
      findByProjectId: async (knowledgeBaseProjectQO: { projectId: string }) => {
        withinSnapshot('knowledgeBase')
        onLoad?.(knowledgeBaseProjectQO)

        return snapshot.knowledgeBase
      },
    },
    {
      findByKnowledgeBaseIdOrderByDocumentIdAsc: async () => {
        withinSnapshot('knowledgeBaseDocuments')

        return snapshot.knowledgeBaseDocuments
      },
    },
    {
      findByDocumentIds: async () => {
        withinSnapshot('documents')

        return snapshot.documents
      },
    },
    {
      findByDocumentIdsOrderByCreatedAtAscAndIdAsc: async () => {
        withinSnapshot('indexes')

        return snapshot.indexes
      },
    },
    {
      findByDocumentRevisionIds: async () => {
        withinSnapshot('revisions')

        return snapshot.revisions
      },
    },
    {
      findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc: async (chunkIndexIdsQO: {
        documentIndexIds: readonly string[]
      }) => {
        withinSnapshot('chunks')

        return chunkEntities.filter((chunk) => chunkIndexIdsQO.documentIndexIds.includes(chunk.documentIndexId))
      },
      findByDocumentIndexIdAndOrdinals: async (chunkIndexOrdinalsQO: ChunkIndexOrdinalsQO) => {
        withinSnapshot('context')
        onContextQuery?.(chunkIndexOrdinalsQO)

        return chunkEntities.filter(
          (chunk) =>
            chunk.documentIndexId === chunkIndexOrdinalsQO.documentIndexId &&
            chunkIndexOrdinalsQO.ordinals.includes(chunk.ordinal),
        )
      },
      findByDocumentIndexIds: async (chunkIndexIdsQO: { documentIndexIds: readonly string[] }) => {
        withinSnapshot('chunkReferences')

        return chunkEntities.filter((chunk) => chunkIndexIdsQO.documentIndexIds.includes(chunk.documentIndexId))
      },
      findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc: async (
        chunkVectorSimilarityQO: ChunkVectorSimilarityQO,
      ) => {
        withinSnapshot('semantic')
        const semanticChunks = chunkEntities
          .filter((chunk) => chunkVectorSimilarityQO.documentIndexIds.includes(chunk.documentIndexId))
          .slice(0, chunkVectorSimilarityQO.limit)
        semanticChunks.forEach((chunk, index) => {
          chunk.recordVectorSearchMatch(chunkVectorSimilarityQO.queryVector, 1 - 1 / (index + 1))
        })

        return semanticChunks
      },
    },
    {
      findBySourceIndexIdsOrderByIdAsc: async () => {
        withinSnapshot('relations')

        return snapshot.relations
      },
    },
  ] as const

  const dependencies: RetrievalPersistenceDependencies = [
    repositories[0],
    createRepositoryStub<RetrievalConstructor[1]>(repositories[1]),
    traceOwner(
      'knowledgeBaseDocuments',
      new LoadRetrievalKnowledgeBaseDocumentsQueryHandler(
        createRepositoryStub<ConstructorParameters<typeof LoadRetrievalKnowledgeBaseDocumentsQueryHandler>[0]>(
          repositories[2],
        ),
      ),
    ),
    traceOwner(
      'documents',
      new LoadRetrievalDocumentsQueryHandler(
        createRepositoryStub<ConstructorParameters<typeof LoadRetrievalDocumentsQueryHandler>[0]>(repositories[3]),
      ),
    ),
    traceOwner(
      'indexes',
      new LoadRetrievalDocumentIndexesQueryHandler(
        createRepositoryStub<ConstructorParameters<typeof LoadRetrievalDocumentIndexesQueryHandler>[0]>(
          repositories[4],
        ),
      ),
    ),
    traceOwner(
      'revisions',
      new LoadRetrievalDocumentRevisionsQueryHandler(
        createRepositoryStub<ConstructorParameters<typeof LoadRetrievalDocumentRevisionsQueryHandler>[0]>(
          repositories[5],
        ),
      ),
    ),
    traceOwner(
      'indexChunks',
      new LoadRetrievalIndexChunksQueryHandler(
        createRepositoryStub<ConstructorParameters<typeof LoadRetrievalIndexChunksQueryHandler>[0]>(repositories[6]),
      ),
    ),
    traceOwner(
      'relations',
      new LoadRetrievalDocumentRelationsQueryHandler(
        createRepositoryStub<ConstructorParameters<typeof LoadRetrievalDocumentRelationsQueryHandler>[0]>(
          repositories[7],
        ),
      ),
    ),
    traceOwner(
      'candidates',
      new FindRetrievalChunkCandidatesQueryHandler(
        createRepositoryStub<ConstructorParameters<typeof FindRetrievalChunkCandidatesQueryHandler>[0]>(
          repositories[6],
        ),
        lexicalCandidates,
      ),
    ),
    traceOwner(
      'chunkContext',
      new LoadRetrievalChunkContextQueryHandler(
        createRepositoryStub<ConstructorParameters<typeof LoadRetrievalChunkContextQueryHandler>[0]>(repositories[6]),
      ),
    ),
  ]

  return { dependencies, calls, ownerCalls }
}

export const retrievalProfileFixtures = {
  chunkingModel: 'test-chunker',
  chunkingProfile: 'markdown-v1',
  embeddingProfile: 'test-embedding-profile',
  lexicalProfile: 'zh-hant-segmenter-v1',
  relationProfile: 'test-relation-profile',
}

export const emptyRetrievalSnapshotFixture = {
  knowledgeBaseId: 'kb',
  knowledgeBaseDocuments: [{ documentId: 'doc', activeDocumentIndexId: null }],
  documents: [{ id: 'doc', sourcePath: 'guide.md' }],
  chunks: [],
  indexes: [],
  revisions: [],
  relations: [],
}
