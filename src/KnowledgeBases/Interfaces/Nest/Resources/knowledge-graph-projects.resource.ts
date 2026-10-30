import type { KnowledgeBase } from '../../../Domain/Entities/knowledge-base.ts'

export class KnowledgeGraphProjectsResource {
  static fromKnowledgeBases(knowledgeBases: readonly KnowledgeBase[]) {
    return {
      projects: knowledgeBases.map((knowledgeBase) => ({
        id: knowledgeBase.projectId,
        name: knowledgeBase.projectName,
      })),
    }
  }
}
