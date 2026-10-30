import assert from 'node:assert/strict'
import test from 'node:test'

import { InvalidDateTimeDisplayOptionsException } from '../../../../src/Shared/Domain/Exceptions/invalid-date-time-display-options.exception.ts'
import { InvalidDateTimeException } from '../../../../src/Shared/Domain/Exceptions/invalid-date-time.exception.ts'
import { DateTime, type DateTimeDisplayOptions } from '../../../../src/Shared/Domain/ValueObjects/date-time.ts'

test('date time owns its timestamp and returns a fresh native date on every access', () => {
  const input = new Date('2026-10-16T12:34:56.789Z')
  const dateTime = new DateTime(input)

  input.setTime(0)
  dateTime.nativeDate.setTime(1)

  assert.equal(dateTime.epochMilliseconds, Date.parse('2026-10-16T12:34:56.789Z'))
  assert.equal(dateTime.isoString, '2026-10-16T12:34:56.789Z')
  assert.notEqual(dateTime.nativeDate, dateTime.nativeDate)
  assert.equal(Object.isFrozen(dateTime), true)
  assert.throws(() => Object.assign(dateTime, { epochMilliseconds: 0 }), TypeError)
})

test('default display uses a fixed ISO calendar, UTC, Latin digits and millisecond precision', () => {
  const dateTime = new DateTime(new Date('2024-02-29T00:00:00.007Z'))

  assert.equal(dateTime.dateText, '2024-02-29')
  assert.equal(dateTime.dateTimeText, '2024-02-29 00:00:00.007')
})

test('display options change local wall time without changing the instant or the original display', () => {
  const original = new DateTime(new Date('2026-10-16T20:34:56.789Z'))
  const local = original.withDisplayOptions({ timeZone: 'Asia/Taipei', locale: 'ar-EG' })

  assert.equal(local.dateText, '2026-10-17')
  assert.equal(local.dateTimeText, '2026-10-17 04:34:56.789')
  assert.equal(local.isoString, original.isoString)
  assert.equal(local.equals(original), true)
  assert.equal(original.dateTimeText, '2026-10-16 20:34:56.789')
  assert.equal(local.withDisplayOptions({ locale: 'en-US' }).dateTimeText, local.dateTimeText)
  assert.equal(new DateTime(local).dateTimeText, local.dateTimeText)
})

test('explicit IANA display zones apply daylight saving transitions', () => {
  const before = new DateTime(new Date('2026-03-08T06:59:59.999Z'), { timeZone: 'America/New_York' })
  const after = new DateTime(new Date('2026-03-08T07:00:00.000Z'), { timeZone: 'America/New_York' })

  assert.equal(before.dateTimeText, '2026-03-08 01:59:59.999')
  assert.equal(after.dateTimeText, '2026-03-08 03:00:00.000')
})

test('date time equality compares epoch milliseconds independently of identity or display options', () => {
  const value = new DateTime(new Date('2026-10-16T12:34:56.789Z'))

  assert.equal(value.equals(new DateTime(value.nativeDate)), true)
  assert.equal(value.equals(new DateTime(new Date(value.epochMilliseconds + 1))), false)
  assert.equal(value.equals(value.nativeDate as unknown as DateTime), false)
})

test('date display retains astronomical year zero and expanded years', () => {
  assert.equal(new DateTime(new Date('0000-07-01T12:00:00.000Z')).dateText, '0000-07-01')
  assert.equal(new DateTime(new Date('-000001-07-01T12:00:00.000Z')).dateText, '-000001-07-01')
  assert.equal(new DateTime(new Date('+010000-07-01T12:00:00.000Z')).dateText, '+010000-07-01')
})

test('invalid timestamps and implicit string parsing fail with the named domain exception', () => {
  const invalidValues: unknown[] = [new Date(Number.NaN), '2026-10-16T00:00:00.000Z', 0, null, undefined, {}]

  invalidValues.forEach((value) => {
    assert.throws(() => new DateTime(value as Date), InvalidDateTimeException)
  })
})

test('invalid display options fail explicitly rather than using host settings', () => {
  const input = new Date('2026-10-16T00:00:00.000Z')
  const invalidOptions: unknown[] = [
    null,
    [],
    'UTC',
    { timeZone: null },
    { timeZone: '' },
    { timeZone: 'Invalid/Zone' },
    { locale: null },
    { locale: '' },
    { locale: 'not_a_locale' },
    { locale: 'zz-ZZ' },
  ]

  invalidOptions.forEach((options) => {
    assert.throws(() => new DateTime(input, options as DateTimeDisplayOptions), InvalidDateTimeDisplayOptionsException)
  })
})
