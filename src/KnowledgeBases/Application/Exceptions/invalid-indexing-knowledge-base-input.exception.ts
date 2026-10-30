export class InvalidIndexingKnowledgeBaseInputException extends Error {
  readonly code = 'INVALID_INDEXING_KNOWLEDGE_BASE_INPUT'

  constructor(readonly field: string) {
    super(`Indexing knowledge base input must provide a valid ${field}.`)
    this.name = 'InvalidIndexingKnowledgeBaseInputException'
  }
}
