export interface RankedCandidate<T> {
  candidate: T
  score: number
  rank: number
}

/** Reciprocal-rank fusion with stable deterministic tie ordering. */
export class HybridRanker {
  static reciprocalRankFusion<T>(
    rankedLists: ReadonlyArray<ReadonlyArray<T>>,
    keyOf: (candidate: T) => string,
    limit: number,
    rankOffset = 60,
  ): RankedCandidate<T>[] {
    const fused = rankedLists
      .flatMap((rankedList) => rankedList.map((candidate, position) => ({ candidate, position })))
      .reduce<Map<string, { candidate: T; score: number; firstSeen: number }>>(
        (fusedCandidatesByKey, rankedEntry, sequence) => {
          const candidateKey = keyOf(rankedEntry.candidate)
          const existingFusedCandidate = fusedCandidatesByKey.get(candidateKey)

          if (existingFusedCandidate) existingFusedCandidate.score += 1 / (rankOffset + rankedEntry.position + 1)
          else
            fusedCandidatesByKey.set(candidateKey, {
              candidate: rankedEntry.candidate,
              score: 1 / (rankOffset + rankedEntry.position + 1),
              firstSeen: sequence,
            })

          return fusedCandidatesByKey
        },
        new Map(),
      )

    return [...fused.values()]
      .sort(
        (leftCandidate, rightCandidate) =>
          rightCandidate.score - leftCandidate.score || leftCandidate.firstSeen - rightCandidate.firstSeen,
      )
      .slice(0, Math.max(0, limit))
      .map(({ candidate, score }, index) => ({ candidate, score, rank: index + 1 }))
  }

  static cosineSimilarity(left: number[], right: number[]): number {
    if (!left.length || left.length !== right.length) return 0

    const { dot, leftMagnitude, rightMagnitude } = left.reduce(
      (totals, leftComponent, index) => {
        const leftValue = leftComponent ?? 0
        const rightValue = right[index] ?? 0

        return {
          dot: totals.dot + leftValue * rightValue,
          leftMagnitude: totals.leftMagnitude + leftValue * leftValue,
          rightMagnitude: totals.rightMagnitude + rightValue * rightValue,
        }
      },
      { dot: 0, leftMagnitude: 0, rightMagnitude: 0 },
    )

    return leftMagnitude && rightMagnitude ? dot / Math.sqrt(leftMagnitude * rightMagnitude) : 0
  }
}
