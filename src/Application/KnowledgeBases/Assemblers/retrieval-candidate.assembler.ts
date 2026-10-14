import type { HybridCandidate, RetrievalChunk } from '../Contracts/rag-retrieval-store.js'

/** Projects the ranks and scores already selected by the use case. */
export class RetrievalCandidateAssembler {
  static toDTO(
    chunk: RetrievalChunk,
    semantic: { score: number; rank: number } | undefined,
    lexical: { score: number; rank: number } | undefined,
  ): HybridCandidate {
    return {
      chunk,
      semanticScore: semantic?.score ?? 0,
      lexicalScore: lexical?.score ?? 0,
      semanticRank: semantic?.rank ?? null,
      lexicalRank: lexical?.rank ?? null,
    }
  }
}
