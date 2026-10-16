import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { RetrievalDocumentIndexDto } from '../DataTransferObjects/retrieval-document-index.dto.ts'

export class RetrievalDocumentIndexAssembler {
  static toRetrievalDocumentIndexDTO(restoredDocumentIndexDTO: DocumentIndex): RetrievalDocumentIndexDto {
    return {
      id: restoredDocumentIndexDTO.id,
      documentId: restoredDocumentIndexDTO.documentId,
      revisionId: restoredDocumentIndexDTO.revisionId,
      chunkingModel: restoredDocumentIndexDTO.chunkingModel,
      chunkingProfile: restoredDocumentIndexDTO.chunkingProfile,
      embeddingModel: restoredDocumentIndexDTO.embeddingModel,
      embeddingDimensions: restoredDocumentIndexDTO.embeddingDimensions,
      embeddingProfile: restoredDocumentIndexDTO.embeddingProfile,
      lexicalProfile: restoredDocumentIndexDTO.lexicalProfile,
      relationProfile: restoredDocumentIndexDTO.relationProfile,
      readyAt: restoredDocumentIndexDTO.readyAt,
    }
  }
}
