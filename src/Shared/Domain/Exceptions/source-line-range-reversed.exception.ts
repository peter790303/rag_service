export class SourceLineRangeReversedException extends Error {
  readonly code = 'SOURCE_LINE_RANGE_REVERSED'

  constructor() {
    super('Source line range end must not precede its start.')
    this.name = 'SourceLineRangeReversedException'
  }
}
