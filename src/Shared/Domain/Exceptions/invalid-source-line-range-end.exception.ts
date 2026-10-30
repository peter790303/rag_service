export class InvalidSourceLineRangeEndException extends Error {
  readonly code = 'INVALID_SOURCE_LINE_RANGE_END'

  constructor() {
    super('Source line range end must be a non-negative integer.')
    this.name = 'InvalidSourceLineRangeEndException'
  }
}
