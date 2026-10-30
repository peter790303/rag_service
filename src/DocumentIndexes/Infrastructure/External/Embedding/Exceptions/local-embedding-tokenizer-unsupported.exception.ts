export class LocalEmbeddingTokenizerUnsupportedException extends Error {
  readonly code = 'LOCAL_EMBEDDING_TOKENIZER_UNSUPPORTED'

  constructor() {
    super('Local embedding requires a BertTokenizer')
    this.name = 'LocalEmbeddingTokenizerUnsupportedException'
  }
}
