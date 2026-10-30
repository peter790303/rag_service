export class HostCliTurnIncompleteException extends Error {
  readonly code = 'HOST_CLI_TURN_INCOMPLETE'

  constructor() {
    super('Host CLI did not complete a turn')
    this.name = 'HostCliTurnIncompleteException'
  }
}
