import type { RetrievalChunk } from './rag-retrieval-store.js'

export type RagChunkSemanticQuery = {
  documentIndexIds: readonly string[]
  queryVector: readonly number[]
  limit: number
}

export type RagChunkLexicalQuery = {
  documentIndexIds: readonly string[]
  terms: readonly string[]
  limit: number
}

/** Ordered query facts; the use case decides rank, union and eligibility. */
export type RagChunkCandidateFacts = {
  chunks: RetrievalChunk[]
  scores: Array<{ chunkId: string; score: number }>
}

/** A single-model reader bound to the retrieval store's read-only snapshot. */
export abstract class RagChunkRepositoryPort {
  abstract findSemanticCandidates(query: RagChunkSemanticQuery): Promise<RagChunkCandidateFacts>

  abstract findLexicalCandidates(query: RagChunkLexicalQuery): Promise<RagChunkCandidateFacts>
}
