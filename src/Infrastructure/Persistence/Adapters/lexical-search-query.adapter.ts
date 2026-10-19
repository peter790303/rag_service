import { InvalidLexicalSearchTermException } from '../Exceptions/invalid-lexical-search-term.exception.ts'
import { LexicalSearchTermTooLongException } from '../Exceptions/lexical-search-term-too-long.exception.ts'

/** Normalized token form used by the persisted full-text search profile. */
export const LEXICAL_PROFILE_VERSION = 'zh-hant-segmenter-v1' as const

const MAX_TSVECTOR_LEXEME_BYTES = 2047
const MAX_TSVECTOR_POSITION = 16383
const MAX_TSVECTOR_POSITIONS_PER_LEXEME = 256
const utf8Encoder = new TextEncoder()

type PositionedLexeme = {
  lexeme: string
  position: number
}

type MapGroupByConstructor = {
  groupBy<Value, Key>(items: Iterable<Value>, keySelector: (value: Value, index: number) => Key): Map<Key, Value[]>
}

export class LexicalSearchQueryAdapter {
  format(text: string): {
    profileVersion: typeof LEXICAL_PROFILE_VERSION
    terms: readonly string[]
    searchText: string
  } {
    const terms = Object.freeze(
      [...new Intl.Segmenter('zh-Hant', { granularity: 'word' }).segment(text.toLocaleLowerCase('zh-Hant'))]
        .filter((segment) => segment.isWordLike)
        .map((segment) => segment.segment),
    )
    const searchText = terms.join(' ')

    return {
      profileVersion: LEXICAL_PROFILE_VERSION,
      terms,
      searchText,
    }
  }

  formatSearchVector(terms: readonly string[]): string {
    const positionedTerms = terms.map((term, index) => this.positionLexeme(term, index))
    const groupedTerms = (Map as unknown as MapGroupByConstructor).groupBy(positionedTerms, ({ lexeme }) => lexeme)

    return [...groupedTerms.entries()].map(([lexeme, occurrences]) => this.formatLexeme(lexeme, occurrences)).join(' ')
  }

  private positionLexeme(lexeme: string, index: number): PositionedLexeme {
    if (typeof lexeme !== 'string' || !lexeme.length || lexeme.includes('\u0000')) {
      throw new InvalidLexicalSearchTermException()
    }

    if (utf8Encoder.encode(lexeme).length > MAX_TSVECTOR_LEXEME_BYTES) {
      throw new LexicalSearchTermTooLongException()
    }

    return {
      lexeme,
      position: Math.min(index + 1, MAX_TSVECTOR_POSITION),
    }
  }

  private formatLexeme(lexeme: string, occurrences: readonly PositionedLexeme[]): string {
    const positions = [...new Set(occurrences.map(({ position }) => position))].slice(
      0,
      MAX_TSVECTOR_POSITIONS_PER_LEXEME,
    )

    return `'${this.escapeLexeme(lexeme)}':${positions.join(',')}`
  }

  private escapeLexeme(term: string): string {
    return term.replaceAll('\\', '\\\\').replaceAll("'", "''")
  }
}
