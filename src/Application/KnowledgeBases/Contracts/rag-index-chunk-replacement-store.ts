import type { PlannedRelation } from '../../../Domain/Knowledge/markdown-chunk.factory.js'
import type { RagDocumentIndex } from '../../../Domain/Knowledge/rag-document-index.js'
import type { ClaimedRagIndexJob } from '../DataTransferObjects/rag-index-job.dto.js'

export type RagChunkReplacementWrite = {
  documentIndexId: string
  ordinal: number
  headingPath: string[]
  content: string
  blockStart: number
  blockEnd: number
  tokenCount: number
  embedding: number[]
  searchVector: string
}

export interface RagIndexChunkReplacementOperations {
  lockDocument(documentId: string): Promise<boolean>

  lockMembership(knowledgeBaseId: string, documentId: string): Promise<{ requestedGeneration: number } | null>

  lockClaimedJob(job: ClaimedRagIndexJob, now: Date): Promise<void>

  lockDocumentIndex(id: string): Promise<RagDocumentIndex | null>

  deleteChunksForIndex(id: string): Promise<void>

  saveChunks(rows: readonly RagChunkReplacementWrite[]): Promise<void>

  deleteRelationsForIndex(id: string): Promise<void>

  saveRelations(documentIndexId: string, relations: readonly PlannedRelation[]): Promise<void>
}

/** Transaction port for replacing one claimed index's complete chunk and relation plan. */
export abstract class RagIndexChunkReplacementStore {
  abstract withReplacementTransaction<T>(
    operation: (transaction: RagIndexChunkReplacementOperations) => Promise<T>,
  ): Promise<T>
}
