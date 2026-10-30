import { InvalidSourceLineRangeEndException } from '../Exceptions/invalid-source-line-range-end.exception.ts'
import { InvalidSourceLineRangeStartException } from '../Exceptions/invalid-source-line-range-start.exception.ts'
import { SourceLineRangeReversedException } from '../Exceptions/source-line-range-reversed.exception.ts'

/** Zero-based source lines in a document revision, with an exclusive end. */
export class SourceLineRange {
  readonly startLine: number

  readonly endLine: number

  constructor(startLine: number, endLine: number) {
    if (!Number.isInteger(startLine) || startLine < 0) throw new InvalidSourceLineRangeStartException()

    if (!Number.isInteger(endLine) || endLine < 0) throw new InvalidSourceLineRangeEndException()

    if (endLine < startLine) throw new SourceLineRangeReversedException()

    this.startLine = startLine
    this.endLine = endLine
    Object.freeze(this)
  }

  equals(other: SourceLineRange): boolean {
    return this.startLine === other.startLine && this.endLine === other.endLine
  }
}
