export class IndexRetrySourceUnavailableException extends Error {
  readonly code = 'INDEX_RETRY_SOURCE_UNAVAILABLE'

  constructor() {
    super('Current source is unavailable')
    this.name = 'IndexRetrySourceUnavailableException'
  }
}
