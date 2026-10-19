export class HostCliOutputLimitExceededException extends Error {
  readonly code = 'HOST_CLI_OUTPUT_LIMIT_EXCEEDED'

  constructor() {
    super('Host CLI exceeds output limit')
    this.name = 'HostCliOutputLimitExceededException'
  }
}
