import { InvalidRetrievalDocumentRevisionsInputException } from '../Exceptions/invalid-retrieval-document-revisions-input.exception.ts'
import type { LoadRetrievalDocumentRevisionsQuery } from '../Queries/load-retrieval-document-revisions.query.ts'

/** Converts retrieval document revision request data into a validated DTO. */
export class RetrievalDocumentRevisionsAssembler {
  static toLoadRetrievalDocumentRevisionsQuery(
    retrievalDocumentRevisionsPayload: unknown,
  ): LoadRetrievalDocumentRevisionsQuery {
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
