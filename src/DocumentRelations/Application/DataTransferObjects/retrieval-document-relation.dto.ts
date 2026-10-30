import type { DocumentRelationResolutionEnum } from '../../Domain/Enums/document-relation-resolution.enum.ts'
import type { DocumentRelationTypeEnum } from '../../Domain/Enums/document-relation-type.enum.ts'

export type RetrievalDocumentRelationResolutionView = {
  relationType: DocumentRelationTypeEnum
  targetAnchor: string | null
  targetDocumentId: string | null
  resolution: DocumentRelationResolutionEnum
  candidateCount: number
}

export type RetrievalDocumentRelationView = RetrievalDocumentRelationResolutionView & {
  relationId: string
  sourceIndexId: string
  sourceDocumentReference: string
  targetDocumentReference: string
  evidenceBlockStart: number
  evidenceBlockEnd: number
  evidenceText: string
}

export type RetrievalDocumentRelationDTO = {
  id: string
  sourceIndexId: string
  targetDocumentId: string | null
  targetReference: string
  targetAnchor: string | null
  relationType: DocumentRelationTypeEnum
  evidenceBlockStart: number
  evidenceBlockEnd: number
  evidenceText: string
}
