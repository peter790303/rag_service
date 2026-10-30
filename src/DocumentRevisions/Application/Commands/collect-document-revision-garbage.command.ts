export type CollectDocumentRevisionGarbageCommand = {
  scope: { readonly retentionCutoff: Date; readonly lockedDocumentIds: readonly string[] }
  candidates: readonly { readonly id: string; readonly documentId: string }[]
}
