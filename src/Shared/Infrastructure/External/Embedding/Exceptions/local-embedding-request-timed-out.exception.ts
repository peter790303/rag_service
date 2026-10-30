export class LocalEmbeddingRequestTimedOutException extends Error {
  readonly code = 'LOCAL_EMBEDDING_REQUEST_TIMED_OUT'

  constructor(message = 'Local embedding request timed out') {
    super(message)
    this.name = 'LocalEmbeddingRequestTimedOutException'
  }
}
