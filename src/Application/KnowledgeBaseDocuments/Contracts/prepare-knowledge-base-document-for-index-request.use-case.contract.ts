import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import type { PrepareKnowledgeBaseDocumentForIndexRequestDTO } from '../DataTransferObjects/prepare-knowledge-base-document-for-index-request.dto.ts'

export abstract class PrepareKnowledgeBaseDocumentForIndexRequestUseCaseContract {
  abstract execute(
    prepareKnowledgeBaseDocumentForIndexRequestDTO: PrepareKnowledgeBaseDocumentForIndexRequestDTO,
  ): Promise<KnowledgeBaseDocument>
}
