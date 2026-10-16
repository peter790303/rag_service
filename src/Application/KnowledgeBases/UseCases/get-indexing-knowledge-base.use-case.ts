import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { GetIndexingKnowledgeBaseUseCaseContract } from '../Contracts/get-indexing-knowledge-base.use-case.contract.ts'
import type { KnowledgeBaseRepository } from '../Contracts/knowledge-base.repository.ts'

/** Provides the owning project used to scope an archived indexing retry. */
export class GetIndexingKnowledgeBaseUseCase implements GetIndexingKnowledgeBaseUseCaseContract {
  constructor(private readonly knowledgeBases: KnowledgeBaseRepository) {}

  async execute(getIndexingKnowledgeBaseDTO: { knowledgeBaseId: string }): Promise<KnowledgeBase | null> {
    const knowledgeBaseIdQO = { knowledgeBaseId: getIndexingKnowledgeBaseDTO.knowledgeBaseId }
    const knowledgeBase = await this.knowledgeBases.findByKnowledgeBaseId(knowledgeBaseIdQO)

    return knowledgeBase
  }
}
