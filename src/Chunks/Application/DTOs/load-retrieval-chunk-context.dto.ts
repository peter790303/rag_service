import type { Chunk } from '../../Domain/Entities/chunk.ts'

export type LoadRetrievalChunkContextDTO = {
  candidates: readonly Chunk[]
  rootChunkIds: readonly string[]
  activeDocumentIndexIds: readonly string[]
}
