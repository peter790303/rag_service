export type RetrievalSnapshotQueryObject = {
  projectId: string
  includeNonEffective: boolean
  lexicalTerms: readonly string[]
}

export type RetrievalSnapshotLimitsQueryObject = {
  snapshotLexicalLimit: number
  vectorCandidateLimit: number
  lexicalCandidateLimit: number
}
