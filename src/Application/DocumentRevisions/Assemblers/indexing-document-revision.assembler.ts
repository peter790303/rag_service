import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { CreateDocumentRevisionQueryObject } from '../QueryObjects/document-revision.query-object.ts'

export class IndexingDocumentRevisionAssembler {
  static toCreateDocumentRevisionQueryObject(revision: DocumentRevision): CreateDocumentRevisionQueryObject {
    return {
      id: revision.id,
      documentId: revision.documentId,
      contentSha256: revision.contentSha256,
      title: revision.title,
      content: revision.content,
      capturedAt: revision.capturedAt.nativeDate,
      createdAt: revision.createdAt.nativeDate,
    }
  }
}
