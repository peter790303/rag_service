import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import type { ReserveKnowledgeBaseDocumentForIndexingDTO } from '../DataTransferObjects/reserve-knowledge-base-document-for-indexing.dto.ts'

export abstract class ReserveKnowledgeBaseDocumentForIndexingUseCaseContract {
  abstract execute(
    reserveKnowledgeBaseDocumentForIndexingDTO: ReserveKnowledgeBaseDocumentForIndexingDTO,
  ): Promise<KnowledgeBaseDocument | null>
}
