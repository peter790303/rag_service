export class IndexRetrySourceChangedException extends Error {
  readonly code = 'INDEX_RETRY_SOURCE_CHANGED'

  constructor() {
    super('Current source changed during retry')
    this.name = 'IndexRetrySourceChangedException'
  }
}
