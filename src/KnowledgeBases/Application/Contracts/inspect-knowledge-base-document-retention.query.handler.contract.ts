import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import type { InspectKnowledgeBaseDocumentRetentionQuery } from '../Queries/inspect-knowledge-base-document-retention.query.ts'

export abstract class InspectKnowledgeBaseDocumentRetentionQueryHandlerContract {
  abstract execute(
    inspectKnowledgeBaseDocumentRetentionDTO: InspectKnowledgeBaseDocumentRetentionQuery,
  ): Promise<KnowledgeBaseDocument | null>
}
