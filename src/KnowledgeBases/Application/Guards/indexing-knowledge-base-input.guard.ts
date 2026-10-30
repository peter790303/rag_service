import { InvalidIndexingKnowledgeBaseInputException } from '../Exceptions/invalid-indexing-knowledge-base-input.exception.ts'

export class IndexingKnowledgeBaseInputGuard {
  static assertValid(knowledgeBaseId: string, projectId: string, projectName: string): void {
    if (typeof knowledgeBaseId !== 'string' || !knowledgeBaseId.trim()) {
      throw new InvalidIndexingKnowledgeBaseInputException('knowledgeBaseId')
    }

    if (typeof projectId !== 'string' || !projectId.trim()) {
      throw new InvalidIndexingKnowledgeBaseInputException('projectId')
    }

    if (typeof projectName !== 'string' || !projectName.trim()) {
      throw new InvalidIndexingKnowledgeBaseInputException('projectName')
    }
  }
}
