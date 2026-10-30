import type { Chunk } from '../../Domain/Entities/chunk.ts'

export type RetrievalCandidateChunkMatchDTO = {
  candidateChunk: Chunk
  semanticRank: number | null
  lexicalMatch: { candidateChunk: Chunk; rank: number } | null
}
