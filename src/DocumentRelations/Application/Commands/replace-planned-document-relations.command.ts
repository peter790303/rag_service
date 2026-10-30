import type { PlannedDocumentRelation } from '../DataTransferObjects/planned-document-relation.dto.ts'

export type ReplacePlannedDocumentRelationsCommand = {
  documentIndexId: string
  plannedDocumentRelations: readonly PlannedDocumentRelation[]
}
