import type { Document } from '../../../Domain/Document/document.ts'
import { InvalidDocumentSourceInputException } from '../Exceptions/invalid-document-source-input.exception.ts'
import type {
  DocumentSourceQueryObject,
  UpsertDocumentSourceQueryObject,
  UpsertDocumentSourceTitleQueryObject,
} from '../QueryObjects/document.query-object.ts'

export type DocumentSourceInput = {
  readonly sourceType: string
  readonly sourceKey: string
  readonly sourcePath: string
  readonly title?: string | null
}

export class IndexingDocumentAssembler {
  static toDocumentSourceInput(sourceDocumentPayload: unknown): DocumentSourceInput {
    if (
      sourceDocumentPayload === null ||
      typeof sourceDocumentPayload !== 'object' ||
      Array.isArray(sourceDocumentPayload)
    ) {
      throw new InvalidDocumentSourceInputException('sourceDocument')
    }

    const sourceDocument = sourceDocumentPayload as Record<string, unknown>

    if (typeof sourceDocument.sourceType !== 'string') {
      throw new InvalidDocumentSourceInputException('sourceType')
    }

    if (typeof sourceDocument.sourceKey !== 'string') {
      throw new InvalidDocumentSourceInputException('sourceKey')
    }

    if (typeof sourceDocument.sourcePath !== 'string') {
      throw new InvalidDocumentSourceInputException('sourcePath')
    }

    const title = sourceDocument.title

    if (title !== undefined && title !== null && typeof title !== 'string') {
      throw new InvalidDocumentSourceInputException('title')
    }

    const documentSourceInput: DocumentSourceInput = {
      sourceType: sourceDocument.sourceType,
      sourceKey: sourceDocument.sourceKey,
      sourcePath: sourceDocument.sourcePath,
    }

    if (title !== undefined) return { ...documentSourceInput, title }

    return documentSourceInput
  }

  static toDocumentSourceQO(document: Document): DocumentSourceQueryObject {
    return {
      sourceType: document.sourceType,
      sourceKey: document.sourceKey,
      sourcePath: document.sourcePath,
    }
  }

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
