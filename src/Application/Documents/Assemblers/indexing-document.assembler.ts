import type { Document } from '../../../Domain/Document/document.ts'
import type {
  UpsertDocumentSourceQueryObject,
  UpsertDocumentSourceTitleQueryObject,
} from '../QueryObjects/document.query-object.ts'

export class IndexingDocumentAssembler {
  static toUpsertDocumentSourceQO(document: Document): UpsertDocumentSourceQueryObject {
    return {
      id: document.id,
      sourceType: document.sourceType,
      sourceKey: document.sourceKey,
      sourcePath: document.sourcePath,
      createdAt: document.createdAt.nativeDate,
      unreferencedSince: document.unreferencedSince?.nativeDate ?? null,
    }
  }

  static toUpsertDocumentSourceTitleQO(document: Document): UpsertDocumentSourceTitleQueryObject {
    return {
      ...this.toUpsertDocumentSourceQO(document),
      currentTitle: document.currentTitle,
    }
  }
}
