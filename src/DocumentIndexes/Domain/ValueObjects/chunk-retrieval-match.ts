import { InvalidChunkRetrievalMatchException } from '../Exceptions/invalid-chunk-retrieval-match.exception.ts'

/** Ordered retrieval evidence for this identified chunk; absent channels have no rank. */
export class ChunkRetrievalMatch {
  constructor(
    readonly semanticScore: number,
    readonly lexicalScore: number,
    readonly semanticRank: number | null,
    readonly lexicalRank: number | null,
  ) {
    if (
      !Number.isFinite(semanticScore) ||
      !Number.isFinite(lexicalScore) ||
      (semanticRank === null && lexicalRank === null) ||
      (semanticRank !== null && (!Number.isInteger(semanticRank) || semanticRank < 1)) ||
      (lexicalRank !== null && (!Number.isInteger(lexicalRank) || lexicalRank < 1)) ||
      (semanticRank === null && semanticScore !== 0) ||
      (lexicalRank === null && lexicalScore !== 0)
    )
      throw new InvalidChunkRetrievalMatchException()
  }
}
