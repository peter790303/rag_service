/** Normalized token form used by the persisted full-text search profile. */
export const LEXICAL_PROFILE_VERSION = 'zh-hant-segmenter-v1' as const

export class RagLexicalQuery {
  readonly terms: readonly string[]

  private constructor(terms: readonly string[]) {
    this.terms = Object.freeze([...terms])
    Object.freeze(this)
  }

  static fromText(text: string): RagLexicalQuery {
    const terms = [...new Intl.Segmenter('zh-Hant', { granularity: 'word' }).segment(text.toLocaleLowerCase('zh-Hant'))]
      .filter((segment) => segment.isWordLike)
      .map((segment) => segment.segment)

    return new RagLexicalQuery(terms)
  }

  toSearchText(): string {
    return this.terms.join(' ')
  }

  equals(other: RagLexicalQuery): boolean {
    return this.terms.length === other.terms.length && this.terms.every((term, index) => term === other.terms[index])
  }
}
