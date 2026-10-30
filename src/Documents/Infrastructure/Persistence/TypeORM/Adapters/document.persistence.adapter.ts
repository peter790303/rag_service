import { Document, type DocumentState } from '../../../../Domain/Entities/document.ts'
import type { DocumentModel } from '../Models/document.model.ts'

/** Restores the persisted identity and retention state without changing its first retention timestamp. */
export class DocumentPersistenceAdapter {
  static toDocument(persistedDocument: Pick<DocumentModel, keyof DocumentState>): Document {
    return new Document({
      id: persistedDocument.id,
      sourceType: persistedDocument.sourceType,
      sourceKey: persistedDocument.sourceKey,
      sourcePath: persistedDocument.sourcePath,
      currentTitle: persistedDocument.currentTitle,
      createdAt: persistedDocument.createdAt,
      unreferencedSince: persistedDocument.unreferencedSince,
    })
  }
}
