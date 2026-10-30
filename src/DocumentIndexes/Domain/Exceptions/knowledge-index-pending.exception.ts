export class KnowledgeIndexPendingException extends Error {
  readonly code = 'REQUIRED_KNOWLEDGE_INDEX_PENDING'

  constructor() {
    super('Knowledge index is not ready')
    this.name = 'KnowledgeIndexPendingException'
  }
}
