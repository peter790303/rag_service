import type { RagExecutionVerification } from './rag.dto.js'
import type { RagExecutionStageEnum } from '../../../Domain/Knowledge/Enums/rag-execution-stage.enum.js'

export type RagJobProgress = {
  stage: RagExecutionStageEnum
  completedUnits: number
  totalUnits: number | null
}

export type ClaimedRagIndexJob = {
  id: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  leaseToken: string
  leaseExpiresAt: Date
  executionVerification: RagExecutionVerification
}
