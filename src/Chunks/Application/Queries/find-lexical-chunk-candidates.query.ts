export type FindLexicalChunkCandidatesQuery = {
  readonly documentIndexIds: readonly string[]
  readonly queryText: string
  readonly limit: number
}
