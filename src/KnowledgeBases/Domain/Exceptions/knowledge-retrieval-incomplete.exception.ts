export class KnowledgeRetrievalIncompleteException extends Error {
  readonly code = 'KNOWLEDGE_RETRIEVAL_INCOMPLETE'

  constructor() {
    super('Knowledge retrieval is missing required facts')
    this.name = 'KnowledgeRetrievalIncompleteException'
  }
}
