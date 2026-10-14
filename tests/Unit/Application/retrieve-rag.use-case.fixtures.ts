import type { RagChunkRepositoryPort } from '../../../src/Application/KnowledgeBases/Contracts/rag-chunk-repository.port.js'
import type { HybridCandidate } from '../../../src/Application/KnowledgeBases/Contracts/rag-retrieval-store.js'

type TestRetrievalChunk = {
  id: string
  content: string
  documentIndexId: string
  ordinal: number
}

export const retrievalStore = <TSnapshot extends { chunks: TestRetrievalChunk[] }>(
  snapshot: TSnapshot,
  onLoad?: (criteria: { projectId: string; includeNonEffective: boolean; lexicalTerms: readonly string[] }) => void,
  onContextCriteria?: (criteria: Array<{ documentIndexId: string; ordinals: readonly number[] }>) => void,
) => ({
  loadHybridSnapshot: async (
    input: { projectId: string; includeNonEffective: boolean; lexicalTerms: readonly string[] },
    select: (snapshot: TSnapshot) => {
      retrievalIndexIds: string[]
      relationTargetIndexIds: string[]
      requiredIndexIds: string[]
      value: unknown
    },
    selectCandidates: (chunks: RagChunkRepositoryPort, selection: unknown) => Promise<HybridCandidate[]>,
    selectContextCriteria: (
      candidates: HybridCandidate[],
      selection: unknown,
    ) => Array<{ documentIndexId: string; ordinals: readonly number[] }>,
  ) => {
    onLoad?.(input)
    const selection = select(snapshot)
    const chunks = snapshot.chunks.map((chunk) => ({
      headingPath: [],
      tokenCount: null,
      embedding: [],
      searchVector: [],
      blockStart: 0,
      blockEnd: 0,
      ...chunk,
    }))
    const candidates = await selectCandidates(
      {
        findSemanticCandidates: async (query) => {
          const matching = chunks
            .filter((chunk) => query.documentIndexIds.includes(chunk.documentIndexId))
            .slice(0, query.limit)

          return {
            chunks: matching,
            scores: matching.map((chunk, index) => ({ chunkId: chunk.id, score: 1 / (index + 1) })),
          }
        },
        findLexicalCandidates: async (query) => {
          const matching = chunks
            .filter(
              (chunk) =>
                query.documentIndexIds.includes(chunk.documentIndexId) &&
                query.terms.some((term) => chunk.content.toLocaleLowerCase().includes(term.toLocaleLowerCase())),
            )
            .slice(0, query.limit)

          return {
            chunks: matching,
            scores: matching.map((chunk, index) => ({ chunkId: chunk.id, score: 1 / (index + 1) })),
          }
        },
      },
      selection.value,
    )
    const contextCriteria = selectContextCriteria(candidates, selection.value)
    onContextCriteria?.(contextCriteria)
    const contextChunks = snapshot.chunks.filter((chunk) =>
      contextCriteria.some(
        (criteria) => criteria.documentIndexId === chunk.documentIndexId && criteria.ordinals.includes(chunk.ordinal),
      ),
    )

    return {
      snapshot,
      candidates,
      contextChunks,
      relationTargetChunks: snapshot.chunks.filter((chunk) =>
        selection.relationTargetIndexIds.includes(chunk.documentIndexId),
      ),
      selection: selection.value,
    }
  },
})

export const testRetrievalProfiles = {
  chunkingModel: 'test-chunker',
  chunkingProfile: 'markdown-v1',
  embeddingProfile: 'test-embedding-profile',
  lexicalProfile: 'zh-hant-segmenter-v1',
  relationProfile: 'test-relation-profile',
}

export const testLexicalFormatter = {
  format: (text: string) => ({
    profileVersion: 'zh-hant-segmenter-v1',
    terms: text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [],
    searchText: text.toLocaleLowerCase(),
  }),
}

export const emptySnapshot = {
  knowledgeBaseId: 'kb',
  chunkCountsByIndexId: {},
  memberships: [{ documentId: 'doc', activeDocumentIndexId: null }],
  documents: [{ id: 'doc', sourcePath: 'guide.md' }],
  chunks: [],
  indexes: [],
  revisions: [],
  relations: [],
}
