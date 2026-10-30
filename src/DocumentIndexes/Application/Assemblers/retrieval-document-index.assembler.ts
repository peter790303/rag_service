import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import type { RetrievalDocumentIndexDTO } from '../DTOs/retrieval-document-index.dto.ts'

export class RetrievalDocumentIndexAssembler {
  static toRetrievalDocumentIndexDTO(restoredDocumentIndexDTO: DocumentIndex): RetrievalDocumentIndexDTO {
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
      readyAt: restoredDocumentIndexDTO.readyAt?.nativeDate ?? null,
    }
  }
}
