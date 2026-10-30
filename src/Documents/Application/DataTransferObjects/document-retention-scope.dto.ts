export interface InspectDocumentRetentionDTO {
  readonly documentId: string
}

export interface LockDocumentRetentionParentsDTO {
  readonly documentIds: readonly string[]
}
