import type { HybridCandidate, RagRetrievalContextCriteria } from '../Contracts/rag-retrieval-store.js'

/** Projects candidate ordinals into the store query's adjacent-context criteria. */
export class RetrievalContextCriteriaAssembler {
  static toQueryObject(candidates: readonly HybridCandidate[]): RagRetrievalContextCriteria {
    const ordinalsByIndex = candidates.reduce((grouped, { chunk }) => {
      const ordinals = grouped.get(chunk.documentIndexId) ?? []
      ordinals.push(chunk.ordinal - 1, chunk.ordinal + 1)
      grouped.set(chunk.documentIndexId, ordinals)

      return grouped
    }, new Map<string, number[]>())

    return [...ordinalsByIndex].flatMap(([documentIndexId, ordinals]) => {
      const validOrdinals = [...new Set(ordinals.filter((ordinal) => ordinal >= 0))]

      return validOrdinals.length > 0 ? [{ documentIndexId, ordinals: validOrdinals }] : []
    })
  }
}
