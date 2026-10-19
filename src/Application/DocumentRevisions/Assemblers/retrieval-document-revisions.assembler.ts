import type { LoadRetrievalDocumentRevisionsDTO } from '../DataTransferObjects/load-retrieval-document-revisions.dto.ts'
import { InvalidRetrievalDocumentRevisionsInputException } from '../Exceptions/invalid-retrieval-document-revisions-input.exception.ts'

/** Converts retrieval document revision request data into a validated DTO. */
export class RetrievalDocumentRevisionsAssembler {
  static toLoadRetrievalDocumentRevisionsDTO(
    retrievalDocumentRevisionsPayload: unknown,
  ): LoadRetrievalDocumentRevisionsDTO {
    if (
      retrievalDocumentRevisionsPayload === null ||
      typeof retrievalDocumentRevisionsPayload !== 'object' ||
      Array.isArray(retrievalDocumentRevisionsPayload)
    ) {
      throw new InvalidRetrievalDocumentRevisionsInputException('input')
    }

    const retrievalDocumentRevisionsInput = retrievalDocumentRevisionsPayload as Record<string, unknown>
    const revisionIds = retrievalDocumentRevisionsInput.revisionIds

    if (!Array.isArray(revisionIds)) throw new InvalidRetrievalDocumentRevisionsInputException('revisionIds')

    const validatedRevisionIds = Array.from(revisionIds as unknown[]).map((revisionId) => {
      if (typeof revisionId !== 'string' || !revisionId.trim()) {
        throw new InvalidRetrievalDocumentRevisionsInputException('revisionIds')
      }

      return revisionId
    })

    return { revisionIds: validatedRevisionIds }
  }
}
