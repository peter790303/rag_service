import type { Chunk } from '../../../Domain/Chunk/chunk.ts'

export type RetrievalCandidateChunkMatchDto = {
  candidateChunk: Chunk
  semanticRank: number | null
  lexicalMatch: { candidateChunk: Chunk; rank: number } | null
}
