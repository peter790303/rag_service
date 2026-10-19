export type DocumentGarbageCollectionScopeDTO = {
  retentionCutoff: Date
  lockedDocumentIds: readonly string[]
}
