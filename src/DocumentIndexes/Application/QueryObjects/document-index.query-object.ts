import type { DocumentIndexStatus } from '../../Domain/Enums/document-index-status.enum.ts'

export interface DocumentIndexIdQO {
  readonly documentIndexId: string
}

export interface DocumentIndexRevisionPipelineQO {
  readonly revisionId: string
  readonly pipelineHash: string
}

export interface DocumentIndexDocumentQO {
  readonly documentId: string
}

export interface DocumentIndexRevisionQO {
  readonly revisionId: string
}

export interface DocumentIndexGarbageCandidatesQO {
  readonly cutoff: Date
}

export interface DocumentIndexDocumentsQO {
  readonly documentIds: readonly string[]
}

export interface CreateBuildingDocumentIndexQO {
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

export interface SaveDocumentIndexLifecycleQO {
  readonly documentIndexId: string
  readonly status: DocumentIndexStatus
  readonly readyAt: Date | null
  readonly unreferencedSince: Date | null
}

export interface SetDocumentIndexUnreferencedSinceQO {
  readonly documentIndexId: string
  readonly unreferencedSince: Date | null
}
