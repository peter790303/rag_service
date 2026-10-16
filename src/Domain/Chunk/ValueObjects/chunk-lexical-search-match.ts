import { InvalidChunkLexicalSearchMatchException } from '../Exceptions/invalid-chunk-lexical-search-match.exception.ts'

/** A lexical score belongs to the original query measured by the ranking source. */
export class ChunkLexicalSearchMatch {
  constructor(
    private readonly queryText: string,
    readonly score: number,
  ) {
    if (typeof queryText !== 'string' || !queryText.trim() || !Number.isFinite(score))
      throw new InvalidChunkLexicalSearchMatchException()
  }

  matches(queryText: string): boolean {
    return this.queryText === queryText
  }
}
