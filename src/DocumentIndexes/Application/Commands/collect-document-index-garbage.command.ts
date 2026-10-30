export type CollectDocumentIndexGarbageCommand = {
  scope: { retentionCutoff: Date; lockedDocumentIds: readonly string[] }
  candidates: readonly { readonly id: string; readonly documentId: string }[]
}
