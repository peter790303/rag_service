export class InvalidKnowledgeGraphQueryException extends Error {
  readonly code = 'INVALID_KNOWLEDGE_GRAPH_QUERY'

  constructor() {
    super('Knowledge graph query is invalid.')
    this.name = 'InvalidKnowledgeGraphQueryException'
  }
}
