export interface ExpiredDocumentIndexFailureDto {
  readonly failedJobId: string
  readonly documentId: string
  readonly failedAt: Date
}
