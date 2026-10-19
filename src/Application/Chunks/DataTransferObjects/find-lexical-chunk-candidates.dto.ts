export type FindLexicalChunkCandidatesDTO = {
  readonly documentIndexIds: readonly string[]
  readonly queryText: string
  readonly limit: number
}
