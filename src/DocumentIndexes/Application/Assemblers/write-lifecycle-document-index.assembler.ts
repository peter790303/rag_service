import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import type {
  SaveDocumentIndexLifecycleQO,
  SetDocumentIndexUnreferencedSinceQO,
} from '../QueryObjects/document-index.query-object.ts'

/** Maps domain lifecycle outcomes to the existing persistence commands. */
export class WriteLifecycleDocumentIndexAssembler {
  static toSaveDocumentIndexLifecycleQO(documentIndex: DocumentIndex): SaveDocumentIndexLifecycleQO {
    return {
      documentIndexId: documentIndex.id,
      status: documentIndex.status,
      readyAt: documentIndex.readyAt?.nativeDate ?? null,
      unreferencedSince: documentIndex.unreferencedSince?.nativeDate ?? null,
    }
  }

  static toSetDocumentIndexUnreferencedSinceQO(documentIndex: DocumentIndex): SetDocumentIndexUnreferencedSinceQO {
    return { documentIndexId: documentIndex.id, unreferencedSince: documentIndex.unreferencedSince?.nativeDate ?? null }
  }
}
