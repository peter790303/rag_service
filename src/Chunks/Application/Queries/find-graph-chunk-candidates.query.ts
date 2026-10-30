export type FindGraphChunkCandidatesQuery = {
  readonly documentIndexIds: readonly string[]
  readonly queryVector: readonly number[]
  readonly limit: number
}
