import type { DocumentRelationTypeEnum } from '../../Domain/Enums/document-relation-type.enum.ts'

export type DocumentRelationSourceIndexQO = {
  readonly sourceIndexId: string
}

export type DocumentRelationTargetDocumentQO = {
  readonly documentId: string
}

export type DocumentRelationSourceIndexesQO = {
  readonly sourceIndexIds: readonly string[]
}

export interface PlannedDocumentRelationWriteQO {
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

export interface InsertPlannedDocumentRelationsQO {
  readonly relations: readonly PlannedDocumentRelationWriteQO[]
}
