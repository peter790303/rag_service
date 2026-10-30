export type LoadKnowledgeGraphDTO = {
  readonly projectId: string
  readonly documentId?: string
  readonly query?: string
  readonly limit?: number
  readonly minSimilarity?: number
}
