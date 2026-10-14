import type { RetrievalSnapshot } from '../Contracts/rag-retrieval-store.js'
import type { RetrievalFullContentDocumentView } from '../DataTransferObjects/retrieval-result.dto.js'

export class RetrievalFullContentDocumentAssembler {
  static toViewModel(input: {
    projectId: string
    document: RetrievalSnapshot['documents'][number]
    revision: RetrievalSnapshot['revisions'][number] & { fullContent: string }
  }): RetrievalFullContentDocumentView {
    const { projectId, document, revision } = input

    return {
      projectId,
      documentReference: document.sourcePath,
      documentTitle: revision.title,
      source: document.sourceType,
      contentVersion: `sha256:${revision.contentSha256}`,
      documentRevisionId: revision.id,
      content: revision.fullContent,
    }
  }
}
