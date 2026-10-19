export class LexicalSearchTermTooLongException extends Error {
  readonly code = 'LEXICAL_SEARCH_TERM_TOO_LONG'

  constructor() {
    super('A lexical search vector term cannot exceed 2047 UTF-8 bytes.')
    this.name = 'LexicalSearchTermTooLongException'
  }
}
