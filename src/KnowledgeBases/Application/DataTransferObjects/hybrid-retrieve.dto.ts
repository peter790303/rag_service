export type HybridRetrieveDTO = {
  projectId: string
  queryText: string
  queryVector?: number[]
  embeddingModelId?: string
  topK?: number
  limit?: number
  documentReference?: string
  includeNonEffective?: boolean
}
