export class KnowledgeEmbeddingUnavailableException extends Error {
  readonly code = 'KNOWLEDGE_EMBEDDING_UNAVAILABLE'

  constructor() {
    super('Knowledge embedding is unavailable')
    this.name = 'KnowledgeEmbeddingUnavailableException'
  }
}
