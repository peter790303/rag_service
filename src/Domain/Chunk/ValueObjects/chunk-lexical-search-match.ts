import { InvalidChunkLexicalSearchMatchException } from '../Exceptions/invalid-chunk-lexical-search-match.exception.ts'

/** A lexical score belongs to the exact terms measured by the ranking source. */
export class ChunkLexicalSearchMatch {
  private readonly terms: readonly string[]

  constructor(
    terms: readonly string[],
    readonly score: number,
  ) {
    if (
      !Array.isArray(terms) ||
      terms.length === 0 ||
      !terms.every((term) => typeof term === 'string' && term.trim().length > 0) ||
      !Number.isFinite(score)
    )
      throw new InvalidChunkLexicalSearchMatchException()

    this.terms = [...terms]
  }

  matches(terms: readonly string[]): boolean {
    return this.terms.length === terms.length && this.terms.every((term, index) => term === terms[index])
  }
}
