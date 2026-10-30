export class HostCliRequestAbortedException extends Error {
  readonly code = 'HOST_CLI_REQUEST_ABORTED'

  constructor() {
    super('Host CLI request aborted')
    this.name = 'HostCliRequestAbortedException'
  }
}
