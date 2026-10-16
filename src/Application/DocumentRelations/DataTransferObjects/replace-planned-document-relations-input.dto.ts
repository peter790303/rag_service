import type { PlannedDocumentRelation } from './planned-document-relation.dto.ts'

export interface ReplacePlannedDocumentRelationsInputDto {
  documentIndexId: string
  plannedDocumentRelations: readonly PlannedDocumentRelation[]
}
