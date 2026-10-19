export type IndexChunkGarbageDTO = {
  documentIndexId: string
  documentId: string
  unreferencedSince: Date | null
  retentionCutoff: Date
  lockedDocumentIds: readonly string[]
}
