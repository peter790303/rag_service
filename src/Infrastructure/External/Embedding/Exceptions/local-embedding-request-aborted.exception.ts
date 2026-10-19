export class LocalEmbeddingRequestAbortedException extends Error {
  readonly code = 'LOCAL_EMBEDDING_REQUEST_ABORTED'

  constructor(message = 'Local embedding request aborted') {
    super(message)
    this.name = 'LocalEmbeddingRequestAbortedException'
  }
}
