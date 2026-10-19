export class KnowledgeBaseDocumentPruneConflictException extends Error {
  readonly code = 'KNOWLEDGE_MEMBERSHIP_PRUNE_CONFLICT'

  constructor(knowledgeBaseId: string, documentId: string) {
    super(`Failed to remove membership ${knowledgeBaseId}:${documentId}`)
    this.name = 'KnowledgeBaseDocumentPruneConflictException'
  }
}
