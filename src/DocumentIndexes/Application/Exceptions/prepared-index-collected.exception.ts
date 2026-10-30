export class PreparedIndexCollectedException extends Error {
  readonly code = 'PREPARED_INDEX_COLLECTED'

  constructor() {
    super('The prepared index was collected before it could be queued')
    this.name = 'PreparedIndexCollectedException'
  }
}
