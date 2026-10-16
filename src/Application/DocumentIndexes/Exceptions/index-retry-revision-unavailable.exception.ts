export class IndexRetryRevisionUnavailableException extends Error {
  readonly code = 'INDEX_RETRY_REVISION_UNAVAILABLE'

  constructor() {
    super('Current indexed source revision is unavailable')
    this.name = 'IndexRetryRevisionUnavailableException'
  }
}
