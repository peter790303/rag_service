import type { DocumentIndexStatus } from '../../../Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import type { DocumentIndexExecutionStatus } from '../Helpers/document-index-execution-lifecycle.helper.ts'

export type DocumentIndexRequestPipeline = {
  contentSha256: string
  pipelineHash: string
  chunkingModel: string
  chunkingProfile: string
  embeddingModel: string
  embeddingDimensions: number
  embeddingProfile: string
  lexicalProfile: string
  relationProfile: string
}

export type DocumentIndexRequestIndex = {
  id: string
  documentId: string
  revisionId: string
  status: DocumentIndexStatus
}

export type DocumentIndexRequestKnowledgeBaseDocument = {
  knowledgeBaseId: string
  documentId: string
  requestedGeneration: string
  activeDocumentIndexId: string | null
}

export type DocumentIndexRequestInitialKnowledgeBaseDocumentState = {
  requestedGeneration: 0
  activeDocumentIndexId: null
  isEntry: false
  alwaysIncludeFullContent: false
}

export type DocumentIndexRequestExecution = {
  id: string
  documentIndexId: string
  generation: string
  status: DocumentIndexExecutionStatus
}
