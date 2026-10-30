import type { KnowledgeBase } from '../../Domain/Entities/knowledge-base.ts'
import type { GetIndexingKnowledgeBaseQuery } from '../Queries/get-indexing-knowledge-base.query.ts'

export abstract class GetIndexingKnowledgeBaseQueryHandlerContract {
  abstract execute(getIndexingKnowledgeBaseDTO: GetIndexingKnowledgeBaseQuery): Promise<KnowledgeBase | null>
}
