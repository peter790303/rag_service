import type { CompleteKnowledgeBaseDocumentIndexingCommand } from '../Commands/complete-knowledge-base-document-indexing.command.ts'

export abstract class CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract {
  abstract execute(
    completeKnowledgeBaseDocumentIndexingCommand: CompleteKnowledgeBaseDocumentIndexingCommand,
  ): Promise<void>
}
