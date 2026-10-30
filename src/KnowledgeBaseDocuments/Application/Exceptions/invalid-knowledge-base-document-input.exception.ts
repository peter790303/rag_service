export class InvalidKnowledgeBaseDocumentInputException extends Error {
  readonly code = 'INVALID_MEMBERSHIP_INPUT'

  constructor(readonly field: string) {
    super(`KnowledgeBaseDocument input must provide a valid ${field}.`)
    this.name = 'InvalidKnowledgeBaseDocumentInputException'
  }
}
