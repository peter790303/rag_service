export type LoadRetrievalChunkContextQuery = {
  candidates: readonly { readonly id: string; readonly documentIndexId: string; readonly ordinal: number }[]
  rootChunkIds: readonly string[]
  activeDocumentIndexIds: readonly string[]
}
