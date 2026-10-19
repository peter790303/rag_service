export class InvalidKnowledgeBaseDocumentIndexGenerationException extends Error {
  readonly code = 'INVALID_MEMBERSHIP_INDEX_GENERATION'

  constructor(readonly context: { currentGeneration: string; requestedGeneration: string }) {
    super('An index request must retain or advance the knowledgeBaseDocument generation once')
    this.name = 'InvalidKnowledgeBaseDocumentIndexGenerationException'
  }
}
