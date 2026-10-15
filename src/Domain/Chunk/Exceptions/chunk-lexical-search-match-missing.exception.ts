export class ChunkLexicalSearchMatchMissingException extends Error {
  readonly code = 'CHUNK_LEXICAL_SEARCH_MATCH_MISSING'

  constructor() {
    super('Chunk has no lexical search measurement for the supplied terms')
    this.name = 'ChunkLexicalSearchMatchMissingException'
  }
}
