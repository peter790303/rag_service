export class InvalidMembershipInputException extends Error {
  readonly code = 'INVALID_MEMBERSHIP_INPUT'

  constructor(readonly field: string) {
    super(`Membership input must provide a valid ${field}.`)
    this.name = 'InvalidMembershipInputException'
  }
}
