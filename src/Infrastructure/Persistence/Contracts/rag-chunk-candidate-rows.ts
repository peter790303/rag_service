import type { RagChunkModel } from '../Models/rag-chunk.model.js'

export type RagChunkCandidateRows = {
  entities: RagChunkModel[]
  raw: Array<{ chunk_id: string; candidate_score: string | number }>
}
