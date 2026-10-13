import type { HybridRetrieveDto } from '../../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'
import type { RagSourceTypeEnum } from '../../../../Domain/Knowledge/Enums/rag-source-type.enum.js'

export type RagRelationType = 'markdown-link' | 'wiki-link'

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
}

export type RetrievalIndex = {
  id: string
  documentId: string
  revisionId: string
  chunkingProfile: string
  embeddingModel: string
  embeddingDimensions: number
  lexicalProfile: string
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
  documents: Array<{ id: string; sourcePath: string; sourceType: RagSourceTypeEnum }>
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

export type HybridSnapshotResult = {
  snapshot: RetrievalSnapshot
  candidates: HybridCandidate[]
  contextChunks: RetrievalChunk[]
  relationTargetChunks: RetrievalChunk[]
}

export abstract class RagRetrievalStore {
  abstract loadSnapshot(input: HybridRetrieveDto): Promise<RetrievalSnapshot>

  /**
   * Resolve documentReference against the authorized membership scope before applying vector or lexical limits.
   * Return every required revision's complete content and relation-target chunks from the same read snapshot.
   */
  abstract loadHybridSnapshot(
    input: HybridRetrieveDto,
    queryVector: number[],
    limits: { vectorLimit: number; lexicalLimit: number },
  ): Promise<HybridSnapshotResult>

  abstract findHybridCandidates(
    input: HybridRetrieveDto,
    queryVector: number[],
    activeIndexIds: string[],
    limits: { vectorLimit: number; lexicalLimit: number },
  ): Promise<HybridCandidate[]>

  abstract loadCandidateContext(
    input: HybridRetrieveDto,
    selectedChunkIds: string[],
    activeIndexIds: string[],
  ): Promise<RetrievalChunk[]>
}
