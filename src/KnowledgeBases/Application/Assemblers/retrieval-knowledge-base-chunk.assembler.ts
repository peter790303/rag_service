import type { LoadRetrievalChunkContextQuery } from '../../../Chunks/Application/Queries/load-retrieval-chunk-context.query.ts'
import type { Chunk } from '../../../Chunks/Domain/Entities/chunk.ts'
import type { HybridChunkCandidate } from '../Types/retrieval-chunk.ts'

/** Copies retrieval evidence from the public Chunk entity boundary into internal ranking inputs. */
export class RetrievalKnowledgeBaseChunkAssembler {
  static toLoadRetrievalChunkContextQuery(
    candidates: readonly Chunk[],
    rootChunkIds: readonly string[],
    activeDocumentIndexIds: readonly string[],
  ): LoadRetrievalChunkContextQuery {
    return {
      candidates: candidates.map(({ id, documentIndexId, ordinal }) => ({ id, documentIndexId, ordinal })),
      rootChunkIds,
      activeDocumentIndexIds,
    }
  }

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
