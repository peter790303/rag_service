export class InvalidMembershipStateException extends Error {
  readonly code = 'INVALID_MEMBERSHIP_STATE'

  constructor(readonly field: string) {
    super(`Membership has an invalid ${field}`)
    this.name = 'InvalidMembershipStateException'
  }
}
