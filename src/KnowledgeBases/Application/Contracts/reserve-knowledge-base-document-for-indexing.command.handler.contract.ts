import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import type { ReserveKnowledgeBaseDocumentForIndexingCommand } from '../Commands/reserve-knowledge-base-document-for-indexing.command.ts'

export abstract class ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract {
  abstract execute(
    reserveKnowledgeBaseDocumentForIndexingDTO: ReserveKnowledgeBaseDocumentForIndexingCommand,
  ): Promise<KnowledgeBaseDocument | null>
}
