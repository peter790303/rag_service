export type FindRetrievalChunkCandidatesDto = {
  documentIndexIds: readonly string[]
  queryVector: readonly number[]
  terms: readonly string[]
  limit: number
}
