import type { Chunk } from '../../../Domain/Chunk/chunk.ts'

export type RetrievalChunk = Chunk
export type HybridChunkCandidate = {
  chunk: Chunk
  semanticScore: number
  lexicalScore: number
  semanticRank: number | null
  lexicalRank: number | null
}
