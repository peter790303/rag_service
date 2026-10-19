export type DocumentRevisionSourceSnapshotDTO = {
  readonly title?: string | null
  readonly content: string
}

export type PrepareDocumentRevisionForIndexRequestDTO = {
  readonly sourceDocument: DocumentRevisionSourceSnapshotDTO
  readonly documentId: string
  readonly contentSha256: string
}
