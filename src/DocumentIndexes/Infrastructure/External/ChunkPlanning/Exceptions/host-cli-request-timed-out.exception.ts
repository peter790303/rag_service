export class HostCliRequestTimedOutException extends Error {
  readonly code = 'HOST_CLI_REQUEST_TIMED_OUT'

  constructor() {
    super('Host CLI request timed out')
    this.name = 'HostCliRequestTimedOutException'
  }
}
