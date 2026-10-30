import { InvalidRetrievalDocumentsInputException } from '../Exceptions/invalid-retrieval-documents-input.exception.ts'
import type { LoadRetrievalDocumentsQuery } from '../Queries/load-retrieval-documents.query.ts'

/** Converts retrieval document request data into a validated DTO. */
export class RetrievalDocumentsAssembler {
  static toLoadRetrievalDocumentsQuery(retrievalDocumentsPayload: unknown): LoadRetrievalDocumentsQuery {
    if (
      retrievalDocumentsPayload === null ||
      typeof retrievalDocumentsPayload !== 'object' ||
      Array.isArray(retrievalDocumentsPayload)
    ) {
      throw new InvalidRetrievalDocumentsInputException('input')
    }

    const retrievalDocumentsInput = retrievalDocumentsPayload as Record<string, unknown>
    const documentIds = retrievalDocumentsInput.documentIds

    if (!Array.isArray(documentIds)) throw new InvalidRetrievalDocumentsInputException('documentIds')

    const validatedDocumentIds = Array.from(documentIds as unknown[]).map((documentId) => {
      if (typeof documentId !== 'string' || !documentId.trim()) {
        throw new InvalidRetrievalDocumentsInputException('documentIds')
      }

      return documentId
    })

    return { documentIds: validatedDocumentIds }
  }
}
