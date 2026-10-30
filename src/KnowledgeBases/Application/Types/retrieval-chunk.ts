import type { Chunk } from '../../../Chunks/Domain/Entities/chunk.ts'

export type RetrievalChunk = Chunk
export type HybridChunkCandidate = {
  chunk: Chunk
  semanticScore: number
  lexicalScore: number
  semanticRank: number | null
  lexicalRank: number | null
}
