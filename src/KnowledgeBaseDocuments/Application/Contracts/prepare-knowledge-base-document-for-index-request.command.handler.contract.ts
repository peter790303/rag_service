import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import type { PrepareKnowledgeBaseDocumentForIndexRequestCommand } from '../Commands/prepare-knowledge-base-document-for-index-request.command.ts'

export abstract class PrepareKnowledgeBaseDocumentForIndexRequestCommandHandlerContract {
  abstract execute(
    prepareKnowledgeBaseDocumentForIndexRequestCommand: PrepareKnowledgeBaseDocumentForIndexRequestCommand,
  ): Promise<KnowledgeBaseDocument>
}
