import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { LoadRetrievalChunkContextDTO } from '../DataTransferObjects/load-retrieval-chunk-context.dto.ts'
import { InvalidRetrievalChunkContextInputException } from '../Exceptions/invalid-retrieval-chunk-context-input.exception.ts'

/** Validates the retrieval context used to select root chunks and query their neighbors. */
export class RetrievalChunkContextAssembler {
  static toLoadRetrievalChunkContextDTO(retrievalChunkContextPayload: unknown): LoadRetrievalChunkContextDTO {
    if (
      retrievalChunkContextPayload === null ||
      typeof retrievalChunkContextPayload !== 'object' ||
      Array.isArray(retrievalChunkContextPayload)
    ) {
      throw new InvalidRetrievalChunkContextInputException('input')
    }

    const retrievalChunkContextInput = retrievalChunkContextPayload as Record<string, unknown>
    const candidates = retrievalChunkContextInput.candidates
    const rootChunkIds = retrievalChunkContextInput.rootChunkIds
    const activeDocumentIndexIds = retrievalChunkContextInput.activeDocumentIndexIds

    if (!Array.isArray(candidates)) throw new InvalidRetrievalChunkContextInputException('candidates')

    const validatedCandidates = Array.from(candidates as unknown[]).map((candidate) => {
      if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new InvalidRetrievalChunkContextInputException('candidates')
      }

      const candidateChunk = candidate as Record<string, unknown>

      if (typeof candidateChunk.id !== 'string' || !candidateChunk.id.trim()) {
        throw new InvalidRetrievalChunkContextInputException('candidates')
      }

      if (typeof candidateChunk.documentIndexId !== 'string' || !candidateChunk.documentIndexId.trim()) {
        throw new InvalidRetrievalChunkContextInputException('candidates')
      }

      if (!Number.isInteger(candidateChunk.ordinal) || Number(candidateChunk.ordinal) < 0) {
        throw new InvalidRetrievalChunkContextInputException('candidates')
      }

      return candidate as Chunk
    })

    const validatedRootChunkIds = this.toRequiredIdentifierArray(rootChunkIds, 'rootChunkIds')
    const validatedActiveDocumentIndexIds = this.toRequiredIdentifierArray(
      activeDocumentIndexIds,
      'activeDocumentIndexIds',
    )

    return {
      candidates: validatedCandidates,
      rootChunkIds: validatedRootChunkIds,
      activeDocumentIndexIds: validatedActiveDocumentIndexIds,
    }
  }

  private static toRequiredIdentifierArray(input: unknown, field: string): string[] {
    if (!Array.isArray(input)) throw new InvalidRetrievalChunkContextInputException(field)

    return Array.from(input as unknown[]).map((identifier) => {
      if (typeof identifier !== 'string' || !identifier.trim()) {
        throw new InvalidRetrievalChunkContextInputException(field)
      }

      return identifier
    })
  }
}
