export type DocumentIndexingFailureDecision = {
  errorCode: string
  errorMessage: string
  failedAt: Date
  retryAt: Date | null
}
