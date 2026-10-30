import type { LoadRetrievalDocumentIndexesDTO } from '../DataTransferObjects/load-retrieval-document-indexes.dto.ts'
import { InvalidRetrievalDocumentIndexesInputException } from '../Exceptions/invalid-retrieval-document-indexes-input.exception.ts'

/** Converts retrieval document index request data into a validated DTO. */
export class RetrievalDocumentIndexesAssembler {
  static toLoadRetrievalDocumentIndexesDTO(retrievalDocumentIndexesPayload: unknown): LoadRetrievalDocumentIndexesDTO {
    if (
      retrievalDocumentIndexesPayload === null ||
      typeof retrievalDocumentIndexesPayload !== 'object' ||
      Array.isArray(retrievalDocumentIndexesPayload)
    ) {
      throw new InvalidRetrievalDocumentIndexesInputException('input')
    }

    const retrievalDocumentIndexesInput = retrievalDocumentIndexesPayload as Record<string, unknown>
    const documentIds = retrievalDocumentIndexesInput.documentIds

    if (!Array.isArray(documentIds)) throw new InvalidRetrievalDocumentIndexesInputException('documentIds')

    const validatedDocumentIds = Array.from(documentIds as unknown[]).map((documentId) => {
      if (typeof documentId !== 'string' || !documentId.trim()) {
        throw new InvalidRetrievalDocumentIndexesInputException('documentIds')
      }

      return documentId
    })

    return { documentIds: validatedDocumentIds }
  }
}
