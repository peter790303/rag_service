/** Normalized token form used by the persisted full-text search profile. */
export const LEXICAL_PROFILE_VERSION = 'zh-hant-segmenter-v1' as const

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
}
