export class IndexRevisionUnavailableException extends Error {
  readonly code = 'INDEX_REVISION_UNAVAILABLE'

  constructor() {
    super('Document index revision is unavailable')
    this.name = 'IndexRevisionUnavailableException'
  }
}
