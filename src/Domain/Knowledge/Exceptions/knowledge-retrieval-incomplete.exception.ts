export class KnowledgeRetrievalIncompleteException extends Error {
  readonly code = 'KNOWLEDGE_RETRIEVAL_INCOMPLETE'

  constructor(message: string) {
    super(message)
    this.name = 'KnowledgeRetrievalIncompleteException'
  }
}
