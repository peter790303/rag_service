export type StartDocumentPruningRetentionCommand = {
  documentId: string
  now: Date
  lockedDocumentIds: readonly string[]
}
