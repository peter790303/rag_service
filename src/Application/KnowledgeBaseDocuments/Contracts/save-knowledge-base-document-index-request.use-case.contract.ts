import type { SaveKnowledgeBaseDocumentIndexRequestDTO } from '../DataTransferObjects/save-knowledge-base-document-index-request.dto.ts'

export abstract class SaveKnowledgeBaseDocumentIndexRequestUseCaseContract {
  abstract execute(saveKnowledgeBaseDocumentIndexRequestDTO: SaveKnowledgeBaseDocumentIndexRequestDTO): Promise<void>
}
