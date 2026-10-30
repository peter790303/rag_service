import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import type { DocumentIndexRecordDTO } from '../DataTransferObjects/document-index-record.dto.ts'

/** Maps restored domain lifecycle fields and persistence metadata to an application record. */
export class ReadDocumentIndexAssembler {
  static toDocumentIndexRecordDTO(restoredDocumentIndexDTO: DocumentIndex): DocumentIndexRecordDTO {
    const documentIndex = restoredDocumentIndexDTO

    return {
      id: documentIndex.id,
      status: documentIndex.status,
      readyAt: documentIndex.readyAt?.nativeDate ?? null,
      unreferencedSince: documentIndex.unreferencedSince?.nativeDate ?? null,
      documentId: restoredDocumentIndexDTO.documentId,
      revisionId: restoredDocumentIndexDTO.revisionId,
      pipelineHash: restoredDocumentIndexDTO.pipelineHash,
      chunkingModel: restoredDocumentIndexDTO.chunkingModel,
      chunkingProfile: restoredDocumentIndexDTO.chunkingProfile,
      embeddingModel: restoredDocumentIndexDTO.embeddingModel,
      embeddingDimensions: restoredDocumentIndexDTO.embeddingDimensions,
      embeddingProfile: restoredDocumentIndexDTO.embeddingProfile,
      lexicalProfile: restoredDocumentIndexDTO.lexicalProfile,
      relationProfile: restoredDocumentIndexDTO.relationProfile,
      createdAt: restoredDocumentIndexDTO.createdAt.nativeDate,
    }
  }
}
