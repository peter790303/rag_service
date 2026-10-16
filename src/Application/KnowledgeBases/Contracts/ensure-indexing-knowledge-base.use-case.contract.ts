export abstract class EnsureIndexingKnowledgeBaseUseCaseContract {
  abstract execute(ensureIndexingKnowledgeBaseDTO: {
    knowledgeBaseId: string
    projectId: string
    projectName: string
  }): Promise<void>
}
