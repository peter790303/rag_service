import type { RetrievalChunk } from '../Contracts/rag-retrieval-store.js'
import type { NeighboringChunkView } from '../DataTransferObjects/retrieval-result.dto.js'

export class RetrievalNeighborViewAssembler {
  static toViewModel(chunk: RetrievalChunk | null): NeighboringChunkView | null {
    return chunk
      ? {
          chunkIndex: chunk.ordinal,
          heading: chunk.headingPath.at(-1) ?? null,
          content: chunk.content,
          reference: chunk.id,
        }
      : null
  }
}
