export type DocumentIndexSuccessReceiptDTO = {
  jobId: string
  projectId: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  executionVerification: Record<string, unknown> | null
  completedAt: Date
}
