export type ChunkIndexQueryObject = {
  readonly documentIndexId: string
}

export type ChunkIndexIdsQueryObject = {
  readonly documentIndexIds: readonly string[]
}

export type ChunkRetrievalCandidatesQueryObject = {
  readonly documentIndexIds: readonly string[]
  readonly chunkIds: readonly string[]
}

export type ChunkIndexOrdinalsQueryObject = {
  readonly documentIndexId: string
  readonly ordinals: readonly number[]
}

export type ChunkVectorSimilarityQueryObject = {
  readonly documentIndexIds: readonly string[]
  readonly queryVector: readonly number[]
  readonly limit: number
}

export type ChunkLexicalSearchQueryObject = {
  readonly documentIndexIds: readonly string[]
  readonly queryText: string
  readonly limit: number
}
