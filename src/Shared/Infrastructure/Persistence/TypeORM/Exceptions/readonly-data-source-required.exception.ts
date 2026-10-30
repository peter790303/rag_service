export class ReadonlyDataSourceRequiredException extends Error {
  readonly code = 'READONLY_DATA_SOURCE_REQUIRED'

  constructor() {
    super('Read snapshots require a dedicated readonly DataSource')
    this.name = 'ReadonlyDataSourceRequiredException'
  }
}
