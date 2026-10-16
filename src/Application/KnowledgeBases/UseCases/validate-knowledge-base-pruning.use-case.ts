import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { KnowledgeBaseRepository } from '../Contracts/knowledge-base.repository.ts'
import type { ValidateKnowledgeBasePruningUseCaseContract } from '../Contracts/validate-knowledge-base-pruning.use-case.contract.ts'
import type { KnowledgeBasePruningScopeDto } from '../DataTransferObjects/knowledge-base-pruning-scope.dto.ts'

export class ValidateKnowledgeBasePruningUseCase implements ValidateKnowledgeBasePruningUseCaseContract {
  constructor(private readonly knowledgeBaseRepository: KnowledgeBaseRepository) {}

  execute(knowledgeBasePruningScopeDTO: KnowledgeBasePruningScopeDto): Promise<KnowledgeBase | null> {
    const knowledgeBaseProjectScopeQO = {
      knowledgeBaseId: knowledgeBasePruningScopeDTO.knowledgeBaseId,
      projectId: knowledgeBasePruningScopeDTO.projectId,
    }

    return this.knowledgeBaseRepository.findByKnowledgeBaseIdAndProjectId(knowledgeBaseProjectScopeQO)
  }
}
