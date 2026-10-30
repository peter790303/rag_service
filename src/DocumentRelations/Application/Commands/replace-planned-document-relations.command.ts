import type { PlannedDocumentRelation } from '../DTOs/planned-document-relation.dto.ts'

export type ReplacePlannedDocumentRelationsCommand = {
  documentIndexId: string
  plannedDocumentRelations: readonly PlannedDocumentRelation[]
}
