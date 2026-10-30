import type { Chunk } from '../../../DocumentIndexes/Domain/Entities/chunk.ts'
import type { HybridChunkCandidate } from '../Types/retrieval-chunk.ts'

/** Copies retrieval evidence from the public Chunk entity boundary into internal ranking inputs. */
export class RetrievalKnowledgeBaseChunkAssembler {
  static toHybridChunkCandidates(candidateChunks: readonly Chunk[]): HybridChunkCandidate[] {
    return candidateChunks.map((chunk) => {
      const retrievalMatch = chunk.requireRetrievalMatch()

      return {
        chunk,
        semanticScore: retrievalMatch.semanticScore,
        lexicalScore: retrievalMatch.lexicalScore,
        semanticRank: retrievalMatch.semanticRank,
        lexicalRank: retrievalMatch.lexicalRank,
      }
    })
  }
}
