import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { KnowledgeBasePruningScopeDto } from '../DataTransferObjects/knowledge-base-pruning-scope.dto.ts'

export abstract class ValidateKnowledgeBasePruningUseCaseContract {
  abstract execute(knowledgeBasePruningScopeDTO: KnowledgeBasePruningScopeDto): Promise<KnowledgeBase | null>
}
