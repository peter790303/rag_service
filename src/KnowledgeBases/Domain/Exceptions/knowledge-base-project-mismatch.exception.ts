export class KnowledgeBaseProjectMismatchException extends Error {
  readonly code = 'KNOWLEDGE_BASE_PROJECT_MISMATCH'

  constructor() {
    super('knowledgeBaseId is already assigned to a different projectId')
    this.name = 'KnowledgeBaseProjectMismatchException'
  }
}
