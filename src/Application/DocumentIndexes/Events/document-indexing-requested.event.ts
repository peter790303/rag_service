import type { SourceDocumentDto } from '../../Documents/DataTransferObjects/source-document.dto.ts'
import { InvalidDocumentIndexingPayloadException } from '../Exceptions/invalid-document-indexing-payload.exception.ts'

/** A source document indexing request has been received. */
export class DocumentIndexingRequestedEvent {
  readonly sourceDocument: SourceDocumentDto & { readonly payload: Record<string, unknown> }

  constructor(sourceDocument: SourceDocumentDto) {
    const payload = sourceDocument.payload === undefined ? {} : sourceDocument.payload

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new InvalidDocumentIndexingPayloadException()
    }

    this.sourceDocument = structuredClone({ ...sourceDocument, payload })
  }
}
