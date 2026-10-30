export type ChunkIndexQO = {
  readonly documentIndexId: string
}

export type ChunkIndexIdsQO = {
  readonly documentIndexIds: readonly string[]
}

export type ChunkRetrievalCandidatesQO = {
  readonly documentIndexIds: readonly string[]
  readonly chunkIds: readonly string[]
}

export type ChunkIndexOrdinalsQO = {
  readonly documentIndexId: string
  readonly ordinals: readonly number[]
}

export type ChunkVectorSimilarityQO = {
  readonly documentIndexIds: readonly string[]
  readonly queryVector: readonly number[]
  readonly limit: number
}

export type ChunkLexicalSearchQO = {
  readonly documentIndexIds: readonly string[]
  readonly queryText: string
  readonly limit: number
}
