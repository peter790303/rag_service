export type FindLexicalChunkCandidatesDto = {
  readonly documentIndexIds: readonly string[]
  readonly terms: readonly string[]
  readonly limit: number
}
