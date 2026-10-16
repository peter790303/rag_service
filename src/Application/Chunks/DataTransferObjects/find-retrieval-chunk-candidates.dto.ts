export type FindRetrievalChunkCandidatesDto = {
  documentIndexIds: readonly string[]
  queryVector: readonly number[]
  queryText: string
  limit: number
}
