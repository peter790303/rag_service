import type { LoadRetrievalIndexChunksDTO } from '../DataTransferObjects/load-retrieval-index-chunks.dto.ts'
import { InvalidRetrievalIndexChunksInputException } from '../Exceptions/invalid-retrieval-index-chunks-input.exception.ts'
import type { ChunkIndexIdsQueryObject } from '../QueryObjects/chunk.query-object.ts'

/** Maps index scopes selected by the caller into chunk repository queries. */
export class QueryRetrievalIndexChunkAssembler {
  static toLoadRetrievalIndexChunksDTO(retrievalIndexChunksPayload: unknown): LoadRetrievalIndexChunksDTO {
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

  static toChunkIndexIdsQueryObject(documentIndexIds: readonly string[]): ChunkIndexIdsQueryObject {
    return { documentIndexIds: [...documentIndexIds] }
  }
}
