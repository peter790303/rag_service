import type { DocumentRelationTypeEnum } from '../../../Domain/DocumentRelation/Enums/document-relation-type.enum.ts'

export type DocumentRelationSourceIndexQueryObject = {
  readonly sourceIndexId: string
}

export type DocumentRelationTargetDocumentQueryObject = {
  readonly documentId: string
}

export type DocumentRelationSourceIndexesQueryObject = {
  readonly sourceIndexIds: readonly string[]
}

export interface PlannedDocumentRelationWrite {
  readonly id: string
  readonly sourceIndexId: string
  readonly targetDocumentId: string | null
  readonly targetReference: string
  readonly targetAnchor: string | null
  readonly relationType: DocumentRelationTypeEnum
  readonly evidenceBlockStart: number
  readonly evidenceBlockEnd: number
  readonly evidenceText: string
}

export interface SavePlannedDocumentRelationsQueryObject {
  readonly relations: readonly PlannedDocumentRelationWrite[]
}
