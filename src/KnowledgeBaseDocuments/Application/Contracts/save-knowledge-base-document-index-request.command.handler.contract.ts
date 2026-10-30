import type { SaveKnowledgeBaseDocumentIndexRequestCommand } from '../Commands/save-knowledge-base-document-index-request.command.ts'

export abstract class SaveKnowledgeBaseDocumentIndexRequestCommandHandlerContract {
  abstract execute(
    saveKnowledgeBaseDocumentIndexRequestCommand: SaveKnowledgeBaseDocumentIndexRequestCommand,
  ): Promise<void>
}
