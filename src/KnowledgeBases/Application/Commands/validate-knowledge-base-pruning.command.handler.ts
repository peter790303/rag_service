import type { ValidateKnowledgeBasePruningCommand } from './validate-knowledge-base-pruning.command.ts'
import type { KnowledgeBase } from '../../Domain/Entities/knowledge-base.ts'
import type { ValidateKnowledgeBasePruningCommandHandlerContract } from '../Contracts/validate-knowledge-base-pruning.command.handler.contract.ts'
import type { KnowledgeBaseRepository } from '../Ports/Out/Repositories/knowledge-base.repository.ts'
import type { KnowledgeBaseProjectScopeQO } from '../QueryObjects/knowledge-base.query-object.ts'

export class ValidateKnowledgeBasePruningCommandHandler implements ValidateKnowledgeBasePruningCommandHandlerContract {
  constructor(private readonly knowledgeBaseRepository: KnowledgeBaseRepository) {}

  execute(knowledgeBasePruningScopeCommand: ValidateKnowledgeBasePruningCommand): Promise<KnowledgeBase | null> {
    const knowledgeBaseProjectScopeQO: KnowledgeBaseProjectScopeQO = {
      knowledgeBaseId: knowledgeBasePruningScopeCommand.knowledgeBaseId,
      projectId: knowledgeBasePruningScopeCommand.projectId,
    }

    return this.knowledgeBaseRepository.findByKnowledgeBaseIdAndProjectId(knowledgeBaseProjectScopeQO)
  }
}
