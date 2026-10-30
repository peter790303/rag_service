export class LocalEmbeddingSpecialTokensUnsupportedException extends Error {
  readonly code = 'LOCAL_EMBEDDING_SPECIAL_TOKENS_UNSUPPORTED'

  constructor() {
    super('Local embedding requires exactly two boundary special tokens')
    this.name = 'LocalEmbeddingSpecialTokensUnsupportedException'
  }
}
