export type LoadGraphChunksDTO = {
  readonly documentIndexIds: readonly string[]
}

export type FindGraphChunkCandidatesDTO = {
  readonly documentIndexIds: readonly string[]
  readonly queryVector: readonly number[]
  readonly limit: number
}
