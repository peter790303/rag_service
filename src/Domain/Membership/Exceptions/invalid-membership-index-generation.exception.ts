export class InvalidMembershipIndexGenerationException extends Error {
  readonly code = 'INVALID_MEMBERSHIP_INDEX_GENERATION'

  constructor(readonly context: { currentGeneration: string; requestedGeneration: string }) {
    super('An index request must retain or advance the membership generation once')
    this.name = 'InvalidMembershipIndexGenerationException'
  }
}
