export class KnowledgeEmbeddingUnavailableException extends Error {
  readonly code = 'KNOWLEDGE_EMBEDDING_UNAVAILABLE'

  constructor(options?: ErrorOptions) {
    super('Knowledge embedding is unavailable', options)
    this.name = 'KnowledgeEmbeddingUnavailableException'
  }
}
