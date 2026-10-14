import type { RagRetrievalProfileSettings } from './rag-retrieval-profile-settings.js'
import type { RagRelationResolutionEnum } from '../../../Domain/Knowledge/Enums/rag-relation-resolution.enum.js'
import type { RagDocumentReference } from '../../../Domain/Knowledge/ValueObjects/rag-document-reference.js'
import type { RankedCandidate } from '../DataTransferObjects/rag.dto.js'

export type RagRetrievalScopeInput<
  TMembership extends {
    documentId: string
    activeDocumentIndexId: string | null
    alwaysIncludeFullContent: boolean
  },
  TDocument extends { id: string; sourcePath: string },
  TIndex extends {
    id: string
    documentId: string
    revisionId: string
    embeddingModel: string
    embeddingDimensions: number
    lexicalProfile: string
    chunkingModel: string
    chunkingProfile: string
    embeddingProfile: string
    relationProfile: string
    readyAt: Date | null
  },
  TRevision extends { id: string; fullContent: string | null },
> = {
  queryEmbedding: number[]
  queryEmbeddingModelId: string | undefined
  lexicalProfileVersion: string
  profiles: RagRetrievalProfileSettings
  documentReference: string | undefined
  includeNonEffective: boolean
  knowledgeBaseId: string | null
  memberships: TMembership[]
  documents: TDocument[]
  indexes: TIndex[]
  revisions: TRevision[]
}

export type RagRetrievalScopeResult<TMembership, TIndex> = {
  requestedMembers: TMembership[]
  activeIndexIds: string[]
  retrievalIndexIds: string[]
  relationTargetIndexIds: string[]
  requiredIndexIds: string[]
  requiredMembers: TMembership[]
  activeIndexes: TIndex[]
}

export type RagHybridRetrievalInput<TChunk, TCandidate extends { chunk: TChunk }> = {
  activeIndexIds: string[]
  candidates: TCandidate[]
  snapshotChunks: TChunk[]
  resultLimit: number
  chunkId: (chunk: TChunk) => string
  documentIndexId: (chunk: TChunk) => string
  semanticRank: (candidate: TCandidate) => number | null
  lexicalRank: (candidate: TCandidate) => number | null
}

export type RagHybridRetrievalResult<TChunk, TCandidate> = {
  scopedCandidates: TCandidate[]
  vectorRanked: TCandidate[]
  lexicalRanked: TCandidate[]
  activeIndexChunks: TChunk[]
  fusedChunkRanking: RankedCandidate<TChunk>[]
}

export type ResolvedRagRelationTarget<TRelationType extends string> = {
  targetDocumentId: string | null
  targetAnchor: string | null
  targetReference: RagDocumentReference | null
  targetIndexId: string | null
  candidateCount: number
  resolution: RagRelationResolutionEnum
  relationType: TRelationType
}

export type ExpansionState<TChunk> = {
  expandedIndexIds: Set<string>
  expandedChunkIds: Set<string>
  chunks: TChunk[]
  processedRelationCount: number
}

export type RagRetrievalContextInput<
  TChunk extends { id: string; documentIndexId: string; ordinal: number },
  TMember extends { activeDocumentIndexId: string | null },
> = {
  activeIndexIds: readonly string[]
  requiredMembers: TMember[]
  activeIndexChunks: TChunk[]
  snapshotChunks: TChunk[]
  contextChunks: TChunk[]
  expandedChunks: TChunk[]
  relationTargetChunks: TChunk[]
  fusedChunkRanking: RankedCandidate<TChunk>[]
}

export type RagRetrievalContextResult<TChunk> = {
  availableContextChunks: TChunk[]
  mandatoryChunks: TChunk[]
  completeChunkRanking: Array<RankedCandidate<TChunk> & { isEffective: boolean; isMandatoryContext: boolean }>
  neighboringChunksById: Map<string, { previousChunk: TChunk | null; nextChunk: TChunk | null }>
}
