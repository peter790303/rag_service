export class LexicalRankingUnavailableException extends Error {
  readonly code = 'LEXICAL_RANKING_UNAVAILABLE'

  constructor() {
    super('Lexical ranking requires a native TypeORM full-text API; SQL authorization is limited to vector queries')
    this.name = 'LexicalRankingUnavailableException'
  }
}
