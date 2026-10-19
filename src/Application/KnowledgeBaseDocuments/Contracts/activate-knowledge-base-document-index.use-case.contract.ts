import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import type { ActivateKnowledgeBaseDocumentIndexDTO } from '../DataTransferObjects/activate-knowledge-base-document-index.dto.ts'

export abstract class ActivateKnowledgeBaseDocumentIndexUseCaseContract {
  abstract execute(
    activateKnowledgeBaseDocumentIndexDTO: ActivateKnowledgeBaseDocumentIndexDTO,
  ): Promise<KnowledgeBaseDocument | null>
}
