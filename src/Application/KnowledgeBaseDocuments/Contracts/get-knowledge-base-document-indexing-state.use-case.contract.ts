import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import type { GetKnowledgeBaseDocumentIndexingStateDTO } from '../DataTransferObjects/get-knowledge-base-document-indexing-state.dto.ts'

export abstract class GetKnowledgeBaseDocumentIndexingStateUseCaseContract {
  abstract execute(
    getKnowledgeBaseDocumentIndexingStateDTO: GetKnowledgeBaseDocumentIndexingStateDTO,
  ): Promise<KnowledgeBaseDocument | null>
}
