import { RagRelationResolutionEnum } from '../../../Domain/Knowledge/Enums/rag-relation-resolution.enum.js'
import type { RagRelationType } from '../../../Domain/Knowledge/Enums/rag-relation-type.enum.js'
import { RagSourceTypeEnum } from '../../../Domain/Knowledge/Enums/rag-source-type.enum.js'

export type RetrievalMatchView = {
  chunk: {
    id: string
    projectId: string
    documentReference: string
    documentTitle: string | null
    source: RagSourceTypeEnum
    contentVersion: string
    isEffective: boolean
    heading: string | null
    chunkIndex: number
    totalChunks: number
    headingPath: string[]
    content: string
    tokenCount: number | null
    indexedAt: string
    chunkingStrategyId: string
    startBlock: number
    embeddingModelId: string
    embeddingVector: number[]
    activeDocumentIndexId: string
    documentRevisionId: string
    searchVector: string[]
    prevChunkReference: string | null
    nextChunkReference: string | null
  }
  neighboringContext: {
    prevChunk: NeighboringChunkView | null
    nextChunk: NeighboringChunkView | null
  }
  matchType: 'hybrid'
  semanticRank: number | null
  lexicalRank: number | null
  rawSemanticScore: number | null
  rawLexicalScore: number | null
  relations: RelationView[]
  score: number
  rank: number
  isMandatoryContext: boolean
}

export type RetrievalFullContentDocumentView = {
  projectId: string
  documentReference: string
  documentTitle: string | null
  source: RagSourceTypeEnum
  contentVersion: string
  documentRevisionId: string
  content: string
}

export type NeighboringChunkView = {
  chunkIndex: number
  heading: string | null
  content: string
  reference: string
}

export type RelationView = {
  relationId: string
  relationType: RagRelationType
  sourceIndexId: string
  sourceDocumentReference: string
  targetDocumentReference: string
  targetAnchor: string | null
  targetDocumentId: string | null
  evidenceBlockStart: number
  evidenceBlockEnd: number
  evidenceText: string
  resolution: RagRelationResolutionEnum
  candidateCount: number
}

export type RelationResolutionView = {
  targetDocumentId: string | null
  targetAnchor: string | null
  candidateCount: number
  resolution: RagRelationResolutionEnum
  relationType: RagRelationType
}
