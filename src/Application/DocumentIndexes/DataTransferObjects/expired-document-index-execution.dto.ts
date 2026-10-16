export type ExpiredDocumentIndexExecutionDto = {
  id: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  payload: Record<string, unknown>
  executionState: Record<string, unknown> | null
  leaseExpiresAt: Date | null
}
