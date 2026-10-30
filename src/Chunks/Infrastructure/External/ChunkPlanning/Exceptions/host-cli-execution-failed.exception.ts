export class HostCliExecutionFailedException extends Error {
  readonly code = 'HOST_CLI_EXECUTION_FAILED'

  constructor() {
    super('Host CLI exited unsuccessfully')
    this.name = 'HostCliExecutionFailedException'
  }
}
