export type ArchiveDocumentIndexSuccessQueryObject = {
  projectId: string
  jobId: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  /** Null when completion only activated a shared READY index; never synthesize provider execution. */
  executionVerification: Record<string, unknown> | null
  completedAt: Date
}

export type FindDocumentIndexSuccessByProjectIdAndJobIdQueryObject = {
  projectId: string
  jobId: string
}
