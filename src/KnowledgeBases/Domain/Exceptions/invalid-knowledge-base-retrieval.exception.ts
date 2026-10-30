export class InvalidKnowledgeBaseRetrievalException extends Error {
  readonly code = 'INVALID_KNOWLEDGE_BASE_RETRIEVAL'

  constructor(reason: string) {
    super(`Invalid knowledge base retrieval: ${reason}`)
    this.name = 'InvalidKnowledgeBaseRetrievalException'
  }
}
