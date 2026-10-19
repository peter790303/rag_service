export type DocumentIndexingRetryTarget = {
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  retriedAt: null
  sourceType: string
  revisionId: string
  pipelineHash: string
  knowledgeBaseDocument: { requestedGeneration: string; activeDocumentIndexId: string | null }
  activeJobId: null
}
