export type DocumentIndexFailureRecordDto = {
  id: string
  jobId: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  errorCode: string | null
  errorMessage: string | null
  blockedReasons: unknown[]
  retryPayload: Record<string, unknown>
  failedAt: Date
  retriedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
