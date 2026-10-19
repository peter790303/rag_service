import type { Chunk } from '../../../Domain/Chunk/chunk.ts'

export type RetrievalCandidateChunkMatchDTO = {
  candidateChunk: Chunk
  semanticRank: number | null
  lexicalMatch: { candidateChunk: Chunk; rank: number } | null
}
