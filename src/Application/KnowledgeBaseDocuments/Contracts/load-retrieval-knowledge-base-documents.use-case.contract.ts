import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import type { LoadRetrievalKnowledgeBaseDocumentsDTO } from '../DataTransferObjects/load-retrieval-knowledge-base-documents.dto.ts'

export abstract class LoadRetrievalKnowledgeBaseDocumentsUseCaseContract {
  abstract execute(
    loadRetrievalKnowledgeBaseDocumentsDTO: LoadRetrievalKnowledgeBaseDocumentsDTO,
  ): Promise<KnowledgeBaseDocument[]>
}
