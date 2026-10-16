import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { DocumentIndexRecordDto } from '../DataTransferObjects/document-index-record.dto.ts'

/** Maps restored domain lifecycle fields and persistence metadata to an application record. */
export class ReadDocumentIndexAssembler {
  static toDocumentIndexRecordDTO(restoredDocumentIndexDTO: DocumentIndex): DocumentIndexRecordDto {
    const documentIndex = restoredDocumentIndexDTO

    return {
      id: documentIndex.id,
      status: documentIndex.status,
      readyAt: documentIndex.readyAt,
      unreferencedSince: documentIndex.unreferencedSince,
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
      createdAt: new Date(restoredDocumentIndexDTO.createdAt),
    }
  }
}
