export type DocumentGarbageCollectionScopeDto = {
  retentionCutoff: Date
  lockedDocumentIds: readonly string[]
}

export type DocumentGarbageCollectionResultDto = {
  deleted: number
  changedDocumentIds: readonly string[]
}
