export type FindRetrievalChunkCandidatesDTO = {
  documentIndexIds: readonly string[]
  queryVector: readonly number[]
  queryText: string
  limit: number
}
