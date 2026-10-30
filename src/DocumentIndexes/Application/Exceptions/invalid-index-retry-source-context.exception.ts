export class InvalidIndexRetrySourceContextException extends Error {
  readonly code = 'INVALID_INDEX_RETRY_SOURCE_CONTEXT'

  constructor() {
    super('Failed job retry payload contains an invalid source context')
    this.name = 'InvalidIndexRetrySourceContextException'
  }
}
