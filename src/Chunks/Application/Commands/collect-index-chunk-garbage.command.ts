export type CollectIndexChunkGarbageCommand = {
  documentIndexId: string
  documentId: string
  unreferencedSince: Date | null
  retentionCutoff: Date
  lockedDocumentIds: readonly string[]
}
