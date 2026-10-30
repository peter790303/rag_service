export class InvalidKnowledgeBaseStateException extends Error {
  readonly code = 'INVALID_KNOWLEDGE_BASE_STATE'

  constructor(field: string) {
    super(`Invalid knowledge base ${field}`)
    this.name = 'InvalidKnowledgeBaseStateException'
  }
}
