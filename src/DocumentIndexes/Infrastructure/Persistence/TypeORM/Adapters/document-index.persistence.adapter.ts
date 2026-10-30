import { DocumentIndex } from '../../../../Domain/Entities/document-index.ts'
import type { DocumentIndexModel } from '../Models/document-index.model.ts'

export class DocumentIndexPersistenceAdapter {
  static toDocumentIndex(model: DocumentIndexModel): DocumentIndex {
    return new DocumentIndex({
      id: model.id,
      documentId: model.documentId,
      revisionId: model.revisionId,
      pipelineHash: model.pipelineHash,
      chunkingModel: model.chunkingModel,
      chunkingProfile: model.chunkingProfile,
      embeddingModel: model.embeddingModel,
      embeddingDimensions: model.embeddingDimensions,
      embeddingProfile: model.embeddingProfile,
      lexicalProfile: model.lexicalProfile,
      relationProfile: model.relationProfile,
      status: model.status,
      createdAt: model.createdAt,
      readyAt: model.readyAt,
      unreferencedSince: model.unreferencedSince,
    })
  }
}
