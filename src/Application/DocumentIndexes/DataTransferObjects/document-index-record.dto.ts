import type { DocumentIndexStatus } from '../../../Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import type { DocumentIndexStatusEnum } from '../../../Domain/DocumentIndex/Enums/document-index-status.enum.ts'

export type DocumentIndexRecordDto = {
  id: string
  documentId: string
  revisionId: string
  pipelineHash: string
  chunkingModel: string
  chunkingProfile: string
  embeddingModel: string
  embeddingDimensions: number
  embeddingProfile: string
  lexicalProfile: string
  relationProfile: string
  status: DocumentIndexStatus
  createdAt: Date
  readyAt: Date | null
  unreferencedSince: Date | null
}

export type BuildingDocumentIndexAttributes = {
  documentId: string
  revisionId: string
  pipelineHash: string
  chunkingModel: string
  chunkingProfile: string
  embeddingModel: string
  embeddingDimensions: number
  embeddingProfile: string
  lexicalProfile: string
  relationProfile: string
  status: typeof DocumentIndexStatusEnum.BUILDING
  readyAt: null
  unreferencedSince: null
}

export type DocumentIndexLifecycleAttributes = {
  status: DocumentIndexStatus
  readyAt: Date | null
  unreferencedSince: Date | null
}
