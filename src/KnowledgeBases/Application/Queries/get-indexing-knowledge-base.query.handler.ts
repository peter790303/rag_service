import type { GetIndexingKnowledgeBaseQuery } from './get-indexing-knowledge-base.query.ts'
import type { KnowledgeBase } from '../../Domain/Entities/knowledge-base.ts'
import type { GetIndexingKnowledgeBaseQueryHandlerContract } from '../Contracts/get-indexing-knowledge-base.query.handler.contract.ts'
import type { KnowledgeBaseRepository } from '../Ports/Out/Repositories/knowledge-base.repository.ts'
import type { KnowledgeBaseIdQueryObject } from '../QueryObjects/knowledge-base.query-object.ts'

/** Provides the owning project used to scope an archived indexing retry. */
export class GetIndexingKnowledgeBaseQueryHandler implements GetIndexingKnowledgeBaseQueryHandlerContract {
  constructor(private readonly knowledgeBases: KnowledgeBaseRepository) {}

  async execute(getIndexingKnowledgeBaseDTO: GetIndexingKnowledgeBaseQuery): Promise<KnowledgeBase | null> {
    const knowledgeBaseIdQO: KnowledgeBaseIdQueryObject = {
      knowledgeBaseId: getIndexingKnowledgeBaseDTO.knowledgeBaseId,
    }
    const knowledgeBase = await this.knowledgeBases.findByKnowledgeBaseId(knowledgeBaseIdQO)

    return knowledgeBase
  }
}
