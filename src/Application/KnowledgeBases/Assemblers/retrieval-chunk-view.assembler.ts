import type { RetrievalChunk, RetrievalSnapshot } from '../Contracts/rag-retrieval-store.js'
import type { RetrievalMatchView } from '../DataTransferObjects/retrieval-result.dto.js'

type ChunkViewDocument = RetrievalSnapshot['documents'][number]
type ChunkViewIndex = Omit<RetrievalSnapshot['indexes'][number], 'readyAt'> & { readyAt: Date }
type ChunkViewRevision = RetrievalSnapshot['revisions'][number]

export class RetrievalChunkViewAssembler {
  static toViewModel(input: {
    chunk: RetrievalChunk
    projectId: string
    document: ChunkViewDocument
    index: ChunkViewIndex
    revision: ChunkViewRevision
    totalChunks: number
    isEffective: boolean
    previousChunk: RetrievalChunk | null
    nextChunk: RetrievalChunk | null
  }): RetrievalMatchView['chunk'] {
    const { chunk, document, index, revision } = input

    return {
      id: chunk.id,
      projectId: input.projectId,
      documentReference: document.sourcePath,
      documentTitle: revision.title,
      source: document.sourceType,
      contentVersion: `sha256:${revision.contentSha256}`,
      isEffective: input.isEffective,
      heading: chunk.headingPath.at(-1) ?? null,
      chunkIndex: chunk.ordinal,
      totalChunks: input.totalChunks,
      headingPath: chunk.headingPath,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      indexedAt: index.readyAt.toISOString(),
      chunkingStrategyId: index.chunkingProfile,
      startBlock: chunk.blockStart,
      embeddingModelId: index.embeddingModel,
      embeddingVector: chunk.embedding,
      activeDocumentIndexId: chunk.documentIndexId,
      documentRevisionId: index.revisionId,
      searchVector: chunk.searchVector,
      prevChunkReference: input.previousChunk?.id ?? null,
      nextChunkReference: input.nextChunk?.id ?? null,
    }
  }
}
