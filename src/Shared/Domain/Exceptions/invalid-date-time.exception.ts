export class InvalidDateTimeException extends Error {
  constructor() {
    super('Date time values must be valid native dates or date time values.')
    this.name = 'InvalidDateTimeException'
  }
}
