import type { Chunk } from '../../../Domain/Chunk/chunk.ts'

export type LoadRetrievalChunkContextDTO = {
  candidates: readonly Chunk[]
  rootChunkIds: readonly string[]
  activeDocumentIndexIds: readonly string[]
}
