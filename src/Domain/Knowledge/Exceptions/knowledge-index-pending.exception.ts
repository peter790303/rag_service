export class KnowledgeIndexPendingException extends Error {
  readonly code = 'REQUIRED_KNOWLEDGE_INDEX_PENDING'

  constructor(message = 'Knowledge index is not ready') {
    super(message)
    this.name = 'KnowledgeIndexPendingException'
  }
}
