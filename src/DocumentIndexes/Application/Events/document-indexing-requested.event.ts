import type { SourceDocumentDTO } from '../../../Documents/Application/DTOs/source-document.dto.ts'
import { InvalidDocumentIndexingPayloadException } from '../Exceptions/invalid-document-indexing-payload.exception.ts'

/** A source document indexing request has been received. */
export class DocumentIndexingRequestedEvent {
  readonly sourceDocument: SourceDocumentDTO & { readonly payload: Record<string, unknown> }

  constructor(sourceDocument: SourceDocumentDTO) {
    const payload = sourceDocument.payload === undefined ? {} : sourceDocument.payload

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new InvalidDocumentIndexingPayloadException()
    }

    this.sourceDocument = structuredClone({ ...sourceDocument, payload })
  }
}
