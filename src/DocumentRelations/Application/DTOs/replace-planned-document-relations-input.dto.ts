import type { PlannedDocumentRelation } from './planned-document-relation.dto.ts'

export interface ReplacePlannedDocumentRelationsInputDTO {
  documentIndexId: string
  plannedDocumentRelations: readonly PlannedDocumentRelation[]
}
