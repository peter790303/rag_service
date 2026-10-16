import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type {
  SaveDocumentIndexLifecycleQueryObject,
  SetDocumentIndexUnreferencedSinceQueryObject,
} from '../QueryObjects/document-index.query-object.ts'

/** Maps domain lifecycle outcomes to the existing persistence commands. */
export class WriteLifecycleDocumentIndexAssembler {
  static toSaveDocumentIndexLifecycleQO(documentIndex: DocumentIndex): SaveDocumentIndexLifecycleQueryObject {
    return {
      documentIndexId: documentIndex.id,
      status: documentIndex.status,
      readyAt: documentIndex.readyAt,
      unreferencedSince: documentIndex.unreferencedSince,
    }
  }

  static toSetDocumentIndexUnreferencedSinceQO(
    documentIndex: DocumentIndex,
  ): SetDocumentIndexUnreferencedSinceQueryObject {
    return { documentIndexId: documentIndex.id, unreferencedSince: documentIndex.unreferencedSince }
  }
}
