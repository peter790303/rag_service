export type CollectDocumentRelationGarbageDto = { sourceIndexId: string; lockedDocumentIds: readonly string[] }

export interface PlanDocumentRelationGarbageDto {
  readonly sourceIndexIds: readonly string[]
}
