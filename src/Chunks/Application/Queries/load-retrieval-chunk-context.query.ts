import type { Chunk } from '../../Domain/Entities/chunk.ts'

export type LoadRetrievalChunkContextQuery = {
  candidates: readonly Chunk[]
  rootChunkIds: readonly string[]
  activeDocumentIndexIds: readonly string[]
}
