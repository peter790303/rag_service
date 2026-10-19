import type { CompleteKnowledgeBaseDocumentIndexingDTO } from '../DataTransferObjects/complete-knowledge-base-document-indexing.dto.ts'

export abstract class CompleteKnowledgeBaseDocumentIndexingUseCaseContract {
  abstract execute(completeKnowledgeBaseDocumentIndexingDTO: CompleteKnowledgeBaseDocumentIndexingDTO): Promise<void>
}
