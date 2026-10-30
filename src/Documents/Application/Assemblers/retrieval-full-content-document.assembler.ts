import type { DocumentRevision } from '../../../DocumentRevisions/Domain/Entities/document-revision.ts'
import type { Document } from '../../Domain/Entities/document.ts'
import type { RetrievalFullContentDocumentView } from '../DataTransferObjects/retrieval-full-content-document.dto.ts'

export class RetrievalFullContentDocumentAssembler {
  static toRetrievalFullContentDocumentDTO(fullContentDocumentFacts: {
    projectId: string
    document: Document
    revision: DocumentRevision
  }): RetrievalFullContentDocumentView {
    const { projectId, document, revision } = fullContentDocumentFacts

    return {
      projectId,
      documentReference: document.sourcePath,
      documentTitle: revision.title,
      source: document.sourceType,
      contentVersion: `sha256:${revision.contentSha256}`,
      documentRevisionId: revision.id,
      content: revision.content,
    }
  }
}
