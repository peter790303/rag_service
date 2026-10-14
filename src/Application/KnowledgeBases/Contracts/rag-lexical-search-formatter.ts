/** Search terms and persisted text produced from the same lexical normalization pass. */
export type RagLexicalSearchRepresentation = {
  profileVersion: string
  terms: readonly string[]
  searchText: string
}

/** Application boundary for lexical search representation; tokenization is a persistence concern. */
export abstract class RagLexicalSearchFormatter {
  abstract format(text: string): RagLexicalSearchRepresentation
}
