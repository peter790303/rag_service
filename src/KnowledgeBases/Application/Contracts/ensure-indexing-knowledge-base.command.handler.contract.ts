import type { EnsureIndexingKnowledgeBaseCommand } from '../Commands/ensure-indexing-knowledge-base.command.ts'

export abstract class EnsureIndexingKnowledgeBaseCommandHandlerContract {
  abstract execute(ensureIndexingKnowledgeBaseCommand: EnsureIndexingKnowledgeBaseCommand): Promise<void>
}
