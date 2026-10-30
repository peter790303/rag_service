import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import type { ActivateKnowledgeBaseDocumentIndexCommand } from '../Commands/activate-knowledge-base-document-index.command.ts'

export abstract class ActivateKnowledgeBaseDocumentIndexCommandHandlerContract {
  abstract execute(
    activateKnowledgeBaseDocumentIndexCommand: ActivateKnowledgeBaseDocumentIndexCommand,
  ): Promise<KnowledgeBaseDocument | null>
}
