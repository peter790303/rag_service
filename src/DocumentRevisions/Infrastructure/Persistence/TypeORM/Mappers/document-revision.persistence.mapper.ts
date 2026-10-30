import { DocumentRevision, type DocumentRevisionState } from '../../../../Domain/Entities/document-revision.ts'
import type { DocumentRevisionModel } from '../Models/document-revision.model.ts'

export class DocumentRevisionPersistenceMapper {
  static toDocumentRevision(
    persistedRevision: Pick<DocumentRevisionModel, keyof DocumentRevisionState>,
  ): DocumentRevision {
    return new DocumentRevision({
      id: persistedRevision.id,
      documentId: persistedRevision.documentId,
      contentSha256: persistedRevision.contentSha256,
      title: persistedRevision.title,
      content: persistedRevision.content,
      capturedAt: persistedRevision.capturedAt,
      createdAt: persistedRevision.createdAt,
    })
  }
}
