export class InvalidDateTimeDisplayOptionsException extends Error {
  constructor(cause?: unknown) {
    super('Date time display requires a valid explicit time zone and locale.', { cause })
    this.name = 'InvalidDateTimeDisplayOptionsException'
  }
}
