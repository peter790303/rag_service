import { InvalidRetrievalIndexChunksInputException } from '../Exceptions/invalid-retrieval-index-chunks-input.exception.ts'
import type { LoadRetrievalIndexChunksQuery } from '../Queries/load-retrieval-index-chunks.query.ts'
import type { ChunkIndexIdsQO } from '../QueryObjects/chunk.query-object.ts'

/** Maps index scopes selected by the caller into chunk repository queries. */
export class QueryRetrievalIndexChunkAssembler {
  static toLoadRetrievalIndexChunksQuery(retrievalIndexChunksPayload: unknown): LoadRetrievalIndexChunksQuery {
    if (
      retrievalIndexChunksPayload === null ||
      typeof retrievalIndexChunksPayload !== 'object' ||
      Array.isArray(retrievalIndexChunksPayload)
    ) {
      throw new InvalidRetrievalIndexChunksInputException('input')
    }

    const retrievalIndexChunksInput = retrievalIndexChunksPayload as Record<string, unknown>
    const fullContentIndexIds = retrievalIndexChunksInput.fullContentIndexIds
    const countedIndexIds = retrievalIndexChunksInput.countedIndexIds

    if (!Array.isArray(fullContentIndexIds)) {
      throw new InvalidRetrievalIndexChunksInputException('fullContentIndexIds')
    }

    const validatedFullContentIndexIds = Array.from(fullContentIndexIds as unknown[]).map((documentIndexId) => {
      if (typeof documentIndexId !== 'string' || !documentIndexId.trim()) {
        throw new InvalidRetrievalIndexChunksInputException('fullContentIndexIds')
      }

      return documentIndexId
    })

    if (!Array.isArray(countedIndexIds)) throw new InvalidRetrievalIndexChunksInputException('countedIndexIds')

    const validatedCountedIndexIds = Array.from(countedIndexIds as unknown[]).map((documentIndexId) => {
      if (typeof documentIndexId !== 'string' || !documentIndexId.trim()) {
        throw new InvalidRetrievalIndexChunksInputException('countedIndexIds')
      }

      return documentIndexId
    })

    return {
      fullContentIndexIds: validatedFullContentIndexIds,
      countedIndexIds: validatedCountedIndexIds,
    }
  }

  static toChunkIndexIdsQO(documentIndexIds: readonly string[]): ChunkIndexIdsQO {
    return { documentIndexIds: [...documentIndexIds] }
  }
}
