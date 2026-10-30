export class InvalidKnowledgeBaseDocumentStateException extends Error {
  readonly code = 'INVALID_MEMBERSHIP_STATE'

  constructor(readonly field: string) {
    super(`KnowledgeBaseDocument has an invalid ${field}`)
    this.name = 'InvalidKnowledgeBaseDocumentStateException'
  }
}
