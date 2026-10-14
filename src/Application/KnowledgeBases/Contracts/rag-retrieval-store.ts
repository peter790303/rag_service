import type { RagChunkRepositoryPort } from './rag-chunk-repository.port.js'
import type { RagRelationType } from '../../../Domain/Knowledge/Enums/rag-relation-type.enum.js'
import type { RagSourceTypeEnum } from '../../../Domain/Knowledge/Enums/rag-source-type.enum.js'

export type RagRetrievalCriteria = {
  projectId: string
  includeNonEffective: boolean
  lexicalTerms: readonly string[]
}

export type RagRetrievalLimits = {
  snapshotLexicalLimit: number
  vectorCandidateLimit: number
  lexicalCandidateLimit: number
}

export type RagRetrievalContextCriteria = Array<{
  documentIndexId: string
  ordinals: readonly number[]
}>

export type RetrievalChunk = {
  id: string
  documentIndexId: string
  ordinal: number
  headingPath: string[]
  content: string
  tokenCount: number | null
  embedding: number[]
  searchVector: string[]
  blockStart: number
  blockEnd: number
}

export type RetrievalIndex = {
  id: string
  documentId: string
  revisionId: string
  chunkingModel: string
  chunkingProfile: string
  embeddingModel: string
  embeddingDimensions: number
  embeddingProfile: string
  lexicalProfile: string
  relationProfile: string
  readyAt: Date | null
}

export type RetrievalMembership = {
  documentId: string
  activeDocumentIndexId: string | null
  isEntry: boolean
  alwaysIncludeFullContent: boolean
}

export type RetrievalSnapshot = {
  knowledgeBaseId: string | null
  memberships: RetrievalMembership[]
  documents: Array<{ id: string; sourcePath: string; sourceKey: string; sourceType: RagSourceTypeEnum }>
  chunks: RetrievalChunk[]
  chunkCountsByIndexId: Record<string, number>
  lexicalCandidateChunkIds: string[]
  indexes: RetrievalIndex[]
  revisions: Array<{ id: string; contentSha256: string; title: string | null; fullContent: string | null }>
  relations: Array<{
    id: string
    sourceIndexId: string
    targetDocumentId: string | null
    targetReference: string
    targetAnchor: string | null
    relationType: RagRelationType
    evidenceBlockStart: number
    evidenceBlockEnd: number
    evidenceText: string
  }>
}

export type HybridCandidate = {
  chunk: RetrievalChunk
  semanticScore: number
  lexicalScore: number
  semanticRank: number | null
  lexicalRank: number | null
}

export type HybridSnapshotSelection<TSelection> = {
  retrievalIndexIds: string[]
  relationTargetIndexIds: string[]
  requiredIndexIds: string[]
  value: TSelection
}

export type HybridSnapshotResult<TSelection = unknown> = {
  snapshot: RetrievalSnapshot
  candidates: HybridCandidate[]
  contextChunks: RetrievalChunk[]
  relationTargetChunks: RetrievalChunk[]
  selection: TSelection
}

export abstract class RagRetrievalStore {
  abstract loadSnapshot(input: RagRetrievalCriteria, limits: RagRetrievalLimits): Promise<RetrievalSnapshot>

  /**
   * Resolve documentReference against the authorized membership scope before applying vector or lexical limits.
   * Return every required revision's complete content and relation-target chunks from the same read snapshot.
   */
  abstract loadHybridSnapshot<TSelection>(
    input: RagRetrievalCriteria,
    select: (snapshot: RetrievalSnapshot) => HybridSnapshotSelection<TSelection>,
    selectCandidates: (chunks: RagChunkRepositoryPort, selection: TSelection) => Promise<HybridCandidate[]>,
    selectContextCriteria: (candidates: HybridCandidate[], selection: TSelection) => RagRetrievalContextCriteria,
  ): Promise<HybridSnapshotResult<TSelection>>
}
