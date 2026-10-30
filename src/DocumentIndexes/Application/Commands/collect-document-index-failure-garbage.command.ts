export type CollectDocumentIndexFailureGarbageCommand = {
  readonly scope: { retentionCutoff: Date; lockedDocumentIds: readonly string[] }
  readonly candidates: readonly { readonly failedJobId: string; readonly documentId: string; readonly failedAt: Date }[]
}
