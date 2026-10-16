export class MembershipReservationEvidenceUnavailableException extends Error {
  readonly code = 'MEMBERSHIP_RESERVATION_EVIDENCE_UNAVAILABLE'

  constructor() {
    super('Membership has no indexing reservation lock evidence')
    this.name = 'MembershipReservationEvidenceUnavailableException'
  }
}
