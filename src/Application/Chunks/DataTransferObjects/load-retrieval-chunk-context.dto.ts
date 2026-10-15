import type { Chunk } from '../../../Domain/Chunk/chunk.ts'

export type LoadRetrievalChunkContextDto = {
  candidates: readonly Chunk[]
  rootChunkIds: readonly string[]
  activeDocumentIndexIds: readonly string[]
}
