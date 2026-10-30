export type FindRetrievalChunkCandidatesQuery = {
  documentIndexIds: readonly string[]
  queryVector: readonly number[]
  queryText: string
  limit: number
}
