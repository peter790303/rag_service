import type { KnowledgeBase } from '../../Domain/Entities/knowledge-base.ts'
import type { ValidateKnowledgeBasePruningCommand } from '../Commands/validate-knowledge-base-pruning.command.ts'

export abstract class ValidateKnowledgeBasePruningCommandHandlerContract {
  abstract execute(knowledgeBasePruningScopeCommand: ValidateKnowledgeBasePruningCommand): Promise<KnowledgeBase | null>
}
