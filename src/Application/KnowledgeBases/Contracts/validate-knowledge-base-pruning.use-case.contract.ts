import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { KnowledgeBasePruningScopeDTO } from '../DataTransferObjects/knowledge-base-pruning-scope.dto.ts'

export abstract class ValidateKnowledgeBasePruningUseCaseContract {
  abstract execute(knowledgeBasePruningScopeDTO: KnowledgeBasePruningScopeDTO): Promise<KnowledgeBase | null>
}
