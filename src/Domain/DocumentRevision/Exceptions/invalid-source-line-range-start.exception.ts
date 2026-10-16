export class InvalidSourceLineRangeStartException extends Error {
  readonly code = 'INVALID_SOURCE_LINE_RANGE_START'

  constructor() {
    super('Source line range start must be a non-negative integer.')
    this.name = 'InvalidSourceLineRangeStartException'
  }
}
