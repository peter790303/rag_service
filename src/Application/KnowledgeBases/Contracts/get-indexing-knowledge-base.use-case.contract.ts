import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { GetIndexingKnowledgeBaseDTO } from '../DataTransferObjects/get-indexing-knowledge-base.dto.ts'

export abstract class GetIndexingKnowledgeBaseUseCaseContract {
  abstract execute(getIndexingKnowledgeBaseDTO: GetIndexingKnowledgeBaseDTO): Promise<KnowledgeBase | null>
}
