export interface ExpiredDocumentIndexFailureDTO {
  readonly failedJobId: string
  readonly documentId: string
  readonly failedAt: Date
}
