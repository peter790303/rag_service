export class KnowledgeBaseDocumentReservationEvidenceUnavailableException extends Error {
  readonly code = 'MEMBERSHIP_RESERVATION_EVIDENCE_UNAVAILABLE'

  constructor() {
    super('KnowledgeBaseDocument has no indexing reservation lock evidence')
    this.name = 'KnowledgeBaseDocumentReservationEvidenceUnavailableException'
  }
}
