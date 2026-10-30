import type { DocumentIndexStatus } from '../../Domain/Enums/document-index-status.enum.ts'

export interface DocumentIndexIdQueryObject {
  readonly documentIndexId: string
}

export interface DocumentIndexRevisionPipelineQueryObject {
  readonly revisionId: string
  readonly pipelineHash: string
}

export interface DocumentIndexDocumentQueryObject {
  readonly documentId: string
}

export interface DocumentIndexRevisionQueryObject {
  readonly revisionId: string
}

export interface DocumentIndexGarbageCandidatesQueryObject {
  readonly cutoff: Date
}

export interface DocumentIndexDocumentsQueryObject {
  readonly documentIds: readonly string[]
}

export interface CreateBuildingDocumentIndexQueryObject {
  readonly id: string
  readonly createdAt: Date
  readonly documentId: string
  readonly revisionId: string
  readonly pipelineHash: string
  readonly chunkingModel: string
  readonly chunkingProfile: string
  readonly embeddingModel: string
  readonly embeddingDimensions: number
  readonly embeddingProfile: string
  readonly lexicalProfile: string
  readonly relationProfile: string
  readonly status: DocumentIndexStatus
  readonly readyAt: Date | null
  readonly unreferencedSince: Date | null
}

export interface SaveDocumentIndexLifecycleQueryObject {
  readonly documentIndexId: string
  readonly status: DocumentIndexStatus
  readonly readyAt: Date | null
  readonly unreferencedSince: Date | null
}

export interface SetDocumentIndexUnreferencedSinceQueryObject {
  readonly documentIndexId: string
  readonly unreferencedSince: Date | null
}
