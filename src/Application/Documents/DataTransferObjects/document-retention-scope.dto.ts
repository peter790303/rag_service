export interface InspectDocumentRetentionDto {
  readonly documentId: string
}

export interface LockDocumentRetentionParentsDto {
  readonly documentIds: readonly string[]
}
