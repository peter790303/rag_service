import type { RagChunkCandidateFacts } from '../../../Application/KnowledgeBases/Contracts/rag-chunk-repository.port.js'
import type { RetrievalChunk } from '../../../Application/KnowledgeBases/Contracts/rag-retrieval-store.js'
import type { RagChunkCandidateRows } from '../Contracts/rag-chunk-candidate-rows.js'
import type { RagChunkModel } from '../Models/rag-chunk.model.js'

/** Converts database representations without selecting or ranking candidates. */
export class RagChunkQueryAdapter {
  static toDTO(chunk: RagChunkModel): RetrievalChunk {
    return {
      id: chunk.id,
      documentIndexId: chunk.documentIndexId,
      ordinal: chunk.ordinal,
      headingPath: chunk.headingPath,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      embedding: chunk.embedding,
      searchVector: chunk.searchVector ? [chunk.searchVector] : [],
      blockStart: chunk.blockStart,
      blockEnd: chunk.blockEnd,
    }
  }

  static toCandidateDTO(rows: RagChunkCandidateRows): RagChunkCandidateFacts {
    return {
      chunks: rows.entities.map((chunk) => this.toDTO(chunk)),
      scores: rows.raw.map((row) => ({ chunkId: row.chunk_id, score: Number(row.candidate_score) })),
    }
  }
}
