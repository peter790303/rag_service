export type RagSourceDocumentDto = {
  knowledgeBaseId: string
  projectId: string
  projectName: string
  sourceType: RagSourceTypeEnum
  sourceKey: string
  sourcePath: string
  title?: string
  content: string
  payload?: Record<string, unknown>
  isEntry?: boolean
  alwaysIncludeFullContent?: boolean
}

export type RankedCandidate<T> = {
  candidate: T
  score: number
  rank: number
}

export type PreparedRagIndexRequest = {
  documentId: string
  revisionId: string
  documentIndexId: string
  currentGeneration: number
  activeDocumentIndexId: string | null
  currentGenerationJobDocumentIndexId: string | null
  currentJobId: string | null
  indexStatus: RagDocumentIndexStatus
  currentJobStatus: RagJobStatus | null
  hasCurrentUnretriedFailure: boolean
}

export type RagIndexRequestResult = {
  documentId: string
  revisionId: string
  documentIndexId: string
  jobId: string | null
  generation: number
  reusedReadyIndex: boolean
  blockedByFailedJob: boolean
}

export type PruneRagMembershipsDto = {
  projectId: string
  knowledgeBaseId: string
  documentIds: string[]
}

export type HybridRetrieveDto = {
  projectId: string
  queryText: string
  queryVector?: number[]
  embeddingModelId?: string
  topK?: number
  limit?: number
  documentReference?: string
  includeNonEffective?: boolean
}

export type RagExecutionVerification = {
  stage: RagExecutionStageEnum
  completedUnits: number
  totalUnits: number | null
  verifiedAt: string | null
  claimToken?: string | null
  leaseExpiresAt?: string | null
}

export type RagJobStatusDto = {
  activeIndex: {
    id: string
    status: RagDocumentIndexStatus
    readyAt: Date | null
  } | null
  requestedTarget: {
    indexId: string
    generation: string
    state: RagJobTargetStateEnum
    jobId: string | null
    failedJobId: string | null
    attempts: number | null
    errorCode: string | null
    errorMessage: string | null
    executionVerification: RagExecutionVerification | null
  } | null
}

export type RetryFailedJobDto = {
  jobId: string | null
  failedJobId: string
  status: RagJobTargetStateEnum
  retryOfFailedJobId: string
}
import type { RagDocumentIndexStatus } from '../../../Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagExecutionStageEnum } from '../../../Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { RagJobTargetStateEnum } from '../../../Domain/Knowledge/Enums/rag-job-target-state.enum.js'
import { RagSourceTypeEnum } from '../../../Domain/Knowledge/Enums/rag-source-type.enum.js'
import type { RagJobStatus } from '../../../Domain/Knowledge/rag-job.js'
