import type { RankedCandidate } from './ranked-candidate.ts'
import type { DocumentRelationResolutionEnum } from '../../../Domain/DocumentRelation/Enums/document-relation-resolution.enum.ts'
import type { DocumentReference } from '../../../Domain/DocumentRelation/ValueObjects/document-reference.ts'
import type { RetrievalProfileSettingsDto } from '../DataTransferObjects/retrieval-profile-settings.dto.ts'

export type RetrievalScopeInput<
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
  TRevision extends { id: string; content: string },
> = {
  queryEmbedding: number[]
  queryEmbeddingModelId: string | undefined
  lexicalProfileVersion: string
  profiles: RetrievalProfileSettingsDto
  documentReference: string | undefined
  includeNonEffective: boolean
  knowledgeBaseId: string | null
  memberships: TMembership[]
  documents: TDocument[]
  indexes: TIndex[]
  revisions: TRevision[]
}

export type RetrievalScopeSelection<TMembership, TIndex> = {
  requestedMembers: TMembership[]
  activeIndexIds: string[]
  retrievalIndexIds: string[]
  relationTargetIndexIds: string[]
  requiredIndexIds: string[]
  requiredMembers: TMembership[]
  activeIndexes: TIndex[]
}

export type HybridRetrievalInput<TChunk, TCandidate extends { chunk: TChunk }> = {
  activeIndexIds: string[]
  candidates: TCandidate[]
  snapshotChunks: TChunk[]
  resultLimit: number
  chunkId: (chunk: TChunk) => string
  documentIndexId: (chunk: TChunk) => string
  semanticRank: (candidate: TCandidate) => number | null
  lexicalRank: (candidate: TCandidate) => number | null
}

export type HybridRetrievalRanking<TChunk, TCandidate> = {
  scopedCandidates: TCandidate[]
  vectorRanked: TCandidate[]
  lexicalRanked: TCandidate[]
  activeIndexChunks: TChunk[]
  fusedChunkRanking: RankedCandidate<TChunk>[]
}

export type ResolvedDocumentRelationTarget<TRelationType extends string> = {
  targetDocumentId: string | null
  targetAnchor: string | null
  targetReference: DocumentReference | null
  targetIndexId: string | null
  candidateCount: number
  resolution: DocumentRelationResolutionEnum
  relationType: TRelationType
}

export type RetrievalExpansionState<TChunk> = {
  expandedIndexIds: Set<string>
  expandedChunkIds: Set<string>
  chunks: TChunk[]
  processedRelationCount: number
}

export type RetrievalContextInput<
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

export type RetrievalContextSelection<TChunk> = {
  availableContextChunks: TChunk[]
  mandatoryChunks: TChunk[]
  completeChunkRanking: (RankedCandidate<TChunk> & {
    isEffective: boolean
    isMandatoryContext: boolean
  })[]
  neighboringChunksById: Map<string, { previousChunk: TChunk | null; nextChunk: TChunk | null }>
}
