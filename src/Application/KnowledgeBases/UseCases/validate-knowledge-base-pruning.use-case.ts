import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { KnowledgeBaseRepository } from '../Contracts/knowledge-base.repository.ts'
import type { ValidateKnowledgeBasePruningUseCaseContract } from '../Contracts/validate-knowledge-base-pruning.use-case.contract.ts'
import type { KnowledgeBasePruningScopeDTO } from '../DataTransferObjects/knowledge-base-pruning-scope.dto.ts'
import type { KnowledgeBaseProjectScopeQueryObject } from '../QueryObjects/knowledge-base.query-object.ts'

export class ValidateKnowledgeBasePruningUseCase implements ValidateKnowledgeBasePruningUseCaseContract {
  constructor(private readonly knowledgeBaseRepository: KnowledgeBaseRepository) {}

  execute(knowledgeBasePruningScopeDTO: KnowledgeBasePruningScopeDTO): Promise<KnowledgeBase | null> {
    const knowledgeBaseProjectScopeQO: KnowledgeBaseProjectScopeQueryObject = {
      knowledgeBaseId: knowledgeBasePruningScopeDTO.knowledgeBaseId,
      projectId: knowledgeBasePruningScopeDTO.projectId,
    }

    return this.knowledgeBaseRepository.findByKnowledgeBaseIdAndProjectId(knowledgeBaseProjectScopeQO)
  }
}
