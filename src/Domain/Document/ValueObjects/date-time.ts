import { InvalidDateTimeDisplayOptionsException } from '../Exceptions/invalid-date-time-display-options.exception.ts'
import { InvalidDateTimeException } from '../Exceptions/invalid-date-time.exception.ts'

export type DateTimeDisplayOptions = {
  readonly timeZone?: string
  readonly locale?: string
}

/** A document lifecycle timestamp shared by document Entities; display options never change its value. */
export class DateTime {
  readonly epochMilliseconds: number

  private readonly displayTimeZone: string

  private readonly displayLocale: string

  constructor(value: Date | DateTime, displayOptions: DateTimeDisplayOptions = {}) {
    if (!(value instanceof Date) && !(value instanceof DateTime)) throw new InvalidDateTimeException()

    const epochMilliseconds = value instanceof DateTime ? value.epochMilliseconds : value.getTime()

    if (!Number.isFinite(epochMilliseconds)) throw new InvalidDateTimeException()

    if (displayOptions === null || typeof displayOptions !== 'object' || Array.isArray(displayOptions))
      throw new InvalidDateTimeDisplayOptionsException()

    const timeZone =
      displayOptions.timeZone === undefined
        ? value instanceof DateTime
          ? value.displayTimeZone
          : 'UTC'
        : displayOptions.timeZone
    const locale =
      displayOptions.locale === undefined
        ? value instanceof DateTime
          ? value.displayLocale
          : 'en-GB'
        : displayOptions.locale

    if (typeof timeZone !== 'string' || !timeZone || typeof locale !== 'string' || !locale)
      throw new InvalidDateTimeDisplayOptionsException()

    try {
      if (Intl.DateTimeFormat.supportedLocalesOf(locale).length === 0)
        throw new InvalidDateTimeDisplayOptionsException()

      const formatter = new Intl.DateTimeFormat(locale, { timeZone, calendar: 'iso8601', numberingSystem: 'latn' })
      const resolvedOptions = formatter.resolvedOptions()
      this.displayTimeZone = resolvedOptions.timeZone
      this.displayLocale = resolvedOptions.locale
    } catch (cause) {
      if (!(cause instanceof RangeError) && !(cause instanceof TypeError)) throw cause

      throw new InvalidDateTimeDisplayOptionsException(cause)
    }

    this.epochMilliseconds = epochMilliseconds
    Object.freeze(this)
  }

  get isoString(): string {
    return this.nativeDate.toISOString()
  }

  get nativeDate(): Date {
    return new Date(this.epochMilliseconds)
  }

  /** ISO calendar date, YYYY-MM-DD (expanded signed years where necessary). */
  get dateText(): string {
    return this.displayParts().date
  }

  /** Local wall time, YYYY-MM-DD HH:mm:ss.SSS; use isoString for interchange. */
  get dateTimeText(): string {
    const displayParts = this.displayParts()

    return `${displayParts.date} ${displayParts.time}`
  }

  withDisplayOptions(displayOptions: DateTimeDisplayOptions): DateTime {
    return new DateTime(this, displayOptions)
  }

  equals(other: DateTime): boolean {
    return other instanceof DateTime && this.epochMilliseconds === other.epochMilliseconds
  }

  private displayParts(): { date: string; time: string } {
    const formatter = new Intl.DateTimeFormat(this.displayLocale, {
      timeZone: this.displayTimeZone,
      // ISO dates use the proleptic Gregorian calendar; Intl's ISO formatter can omit the era part.
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      era: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hourCycle: 'h23',
    })
    const parts = formatter.formatToParts(this.nativeDate)
    const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((entry) => entry.type === type)!.value
    // The fixed numeric format retains astronomical year zero regardless of the selected locale's era label.
    const beforeCommonEra = formatter
      .formatToParts(new Date('0000-07-01T12:00:00.000Z'))
      .find((entry) => entry.type === 'era')!.value
    const yearNumber = part('era') === beforeCommonEra ? 1 - Number(part('year')) : Number(part('year'))
    const year =
      yearNumber >= 0 && yearNumber <= 9999
        ? String(yearNumber).padStart(4, '0')
        : `${yearNumber < 0 ? '-' : '+'}${String(Math.abs(yearNumber)).padStart(6, '0')}`

    return {
      date: `${year}-${part('month')}-${part('day')}`,
      time: `${part('hour')}:${part('minute')}:${part('second')}.${part('fractionalSecond')}`,
    }
  }
}
