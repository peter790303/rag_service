import { InvalidChunkVectorSearchMatchException } from '../Exceptions/invalid-chunk-vector-search-match.exception.ts'

/** A database-measured cosine distance belongs to one immutable query vector. */
export class ChunkVectorSearchMatch {
  private readonly queryVector: readonly number[]

  constructor(
    queryVector: readonly number[],
    readonly cosineDistance: number,
  ) {
    if (
      !Array.isArray(queryVector) ||
      queryVector.length === 0 ||
      !queryVector.every(Number.isFinite) ||
      !Number.isFinite(cosineDistance)
    )
      throw new InvalidChunkVectorSearchMatchException()

    this.queryVector = [...queryVector]
  }

  matches(queryVector: readonly number[]): boolean {
    return (
      this.queryVector.length === queryVector.length &&
      this.queryVector.every((value, index) => value === queryVector[index])
    )
  }
}
