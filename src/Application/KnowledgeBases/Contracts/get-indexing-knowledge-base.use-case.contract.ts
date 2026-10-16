import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'

export abstract class GetIndexingKnowledgeBaseUseCaseContract {
  abstract execute(getIndexingKnowledgeBaseDTO: { knowledgeBaseId: string }): Promise<KnowledgeBase | null>
}
