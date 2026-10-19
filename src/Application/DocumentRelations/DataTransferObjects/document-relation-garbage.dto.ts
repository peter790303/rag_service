export type CollectDocumentRelationGarbageDTO = { sourceIndexId: string; lockedDocumentIds: readonly string[] }

export interface PlanDocumentRelationGarbageDTO {
  readonly sourceIndexIds: readonly string[]
}
