import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import type { PrepareDocumentRevisionForIndexRequestDTO } from '../DataTransferObjects/prepare-document-revision-for-index-request.dto.ts'
import { InvalidDocumentRevisionIndexRequestInputException } from '../Exceptions/invalid-document-revision-index-request-input.exception.ts'
import type { CreateDocumentRevisionQueryObject } from '../QueryObjects/document-revision.query-object.ts'

type DocumentRevisionIndexRequestInput = {
  readonly documentId: string
  readonly contentSha256: string
  readonly title: string | null
  readonly content: string
}

export class IndexingDocumentRevisionAssembler {
  static toDocumentRevisionIndexRequestInput(
    documentRevisionIndexRequestPayload: unknown,
  ): DocumentRevisionIndexRequestInput {
    if (
      documentRevisionIndexRequestPayload === null ||
      typeof documentRevisionIndexRequestPayload !== 'object' ||
      Array.isArray(documentRevisionIndexRequestPayload)
    )
      throw new InvalidDocumentRevisionIndexRequestInputException('request')

    const request = documentRevisionIndexRequestPayload as Partial<PrepareDocumentRevisionForIndexRequestDTO>
    const sourceDocument = request.sourceDocument

    if (typeof request.documentId !== 'string')
      throw new InvalidDocumentRevisionIndexRequestInputException('documentId')

    if (typeof request.contentSha256 !== 'string')
      throw new InvalidDocumentRevisionIndexRequestInputException('contentSha256')

    if (sourceDocument === null || typeof sourceDocument !== 'object' || Array.isArray(sourceDocument))
      throw new InvalidDocumentRevisionIndexRequestInputException('sourceDocument')

    if (typeof sourceDocument.content !== 'string')
      throw new InvalidDocumentRevisionIndexRequestInputException('sourceDocument.content')

    const title = sourceDocument.title

    if (title !== undefined && title !== null && typeof title !== 'string')
      throw new InvalidDocumentRevisionIndexRequestInputException('sourceDocument.title')

    return {
      documentId: request.documentId,
      contentSha256: request.contentSha256,
      title: title ?? null,
      content: sourceDocument.content,
    }
  }

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
