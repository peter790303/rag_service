export class InvalidLexicalSearchTermException extends Error {
  readonly code = 'INVALID_LEXICAL_SEARCH_TERM'

  constructor() {
    super('A lexical search vector term must be a non-empty PostgreSQL text value.')
    this.name = 'InvalidLexicalSearchTermException'
  }
}
