export class InvalidChunkLexicalSearchMatchException extends Error {
  readonly code = 'INVALID_CHUNK_LEXICAL_SEARCH_MATCH'

  constructor() {
    super('Chunk lexical search requires nonempty terms and a finite score')
    this.name = 'InvalidChunkLexicalSearchMatchException'
  }
}
