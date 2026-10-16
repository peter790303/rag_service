export type FindLexicalChunkCandidatesDto = {
  readonly documentIndexIds: readonly string[]
  readonly queryText: string
  readonly limit: number
}
