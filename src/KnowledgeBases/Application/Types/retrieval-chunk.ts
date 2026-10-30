import type { Chunk } from '../../../DocumentIndexes/Domain/Entities/chunk.ts'

export type RetrievalChunk = Chunk
export type HybridChunkCandidate = {
  chunk: Chunk
  semanticScore: number
  lexicalScore: number
  semanticRank: number | null
  lexicalRank: number | null
}
