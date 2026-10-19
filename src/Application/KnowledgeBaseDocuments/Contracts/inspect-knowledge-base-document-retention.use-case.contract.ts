import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import type { KnowledgeBaseDocumentRetentionDTO } from '../DataTransferObjects/knowledge-base-document-retention.dto.ts'

export abstract class InspectKnowledgeBaseDocumentRetentionUseCaseContract {
  abstract execute(
    inspectKnowledgeBaseDocumentRetentionDTO: KnowledgeBaseDocumentRetentionDTO,
  ): Promise<KnowledgeBaseDocument | null>
}
