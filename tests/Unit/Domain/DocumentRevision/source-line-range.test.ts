import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { InvalidSourceLineRangeEndException } from '../../../../src/Shared/Domain/Exceptions/invalid-source-line-range-end.exception.ts'
import { InvalidSourceLineRangeStartException } from '../../../../src/Shared/Domain/Exceptions/invalid-source-line-range-start.exception.ts'
import { SourceLineRangeReversedException } from '../../../../src/Shared/Domain/Exceptions/source-line-range-reversed.exception.ts'
import { SourceLineRange } from '../../../../src/Shared/Domain/ValueObjects/source-line-range.ts'

describe('SourceLineRange', () => {
  it('preserves zero-based coordinates with an exclusive end and accepts empty ranges', () => {
    const range = new SourceLineRange(0, 3)
    const emptyRange = new SourceLineRange(3, 3)

    assert.equal(range.startLine, 0)
    assert.equal(range.endLine, 3)
    assert.equal(emptyRange.startLine, 3)
    assert.equal(emptyRange.endLine, 3)
    assert.doesNotThrow(() => new SourceLineRange(0, 0))
  })

  it('compares both coordinates by value', () => {
    const range = new SourceLineRange(1, 4)

    assert.equal(range.equals(new SourceLineRange(1, 4)), true)
    assert.equal(range.equals(new SourceLineRange(2, 4)), false)
    assert.equal(range.equals(new SourceLineRange(1, 5)), false)
  })

  it('cannot change after construction', () => {
    const range = new SourceLineRange(1, 4)

    assert.equal(Object.isFrozen(range), true)
    assert.throws(() => Object.assign(range, { startLine: 2 }), TypeError)
    assert.throws(() => Object.assign(range, { endLine: 8 }), TypeError)
    assert.equal(range.equals(new SourceLineRange(1, 4)), true)
  })

  it('distinguishes invalid starts, invalid ends and reversed ranges', () => {
    const invalidCoordinates = [-1, 1.5, NaN, Infinity, undefined, null, '1']

    invalidCoordinates.forEach((coordinate) => {
      assert.throws(() => new SourceLineRange(coordinate as number, 4), InvalidSourceLineRangeStartException)
      assert.throws(() => new SourceLineRange(0, coordinate as number), InvalidSourceLineRangeEndException)
    })
    assert.throws(() => new SourceLineRange(4, 3), SourceLineRangeReversedException)
    assert.throws(() => new SourceLineRange(-1, -2), InvalidSourceLineRangeStartException)
    assert.throws(() => new SourceLineRange(4, -1), InvalidSourceLineRangeEndException)
  })
})
