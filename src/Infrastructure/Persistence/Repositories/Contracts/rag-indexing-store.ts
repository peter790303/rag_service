import type {
  PreparedRagIndexRequest,
  RagExecutionVerification,
  RagIndexRequestResult,
  RagSourceDocumentDto,
} from '../../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'
import type { RagExecutionStageEnum } from '../../../../Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import type { MarkdownPlan } from '../../../../Domain/Knowledge/markdown-chunk.factory.js'

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

export abstract class RagIndexingStore {
  abstract prepareIndexRequest(input: RagSourceDocumentDto): Promise<PreparedRagIndexRequest>

  abstract activateReadyIndex(input: {
    knowledgeBaseId: string
    documentId: string
    documentIndexId: string
    currentGeneration: number
  }): Promise<RagIndexRequestResult>

  abstract enqueueIndex(
    input: RagSourceDocumentDto,
    prepared: PreparedRagIndexRequest,
    generation: number,
  ): Promise<RagIndexRequestResult>

  abstract claimNext(): Promise<ClaimedRagIndexJob | null>

  abstract heartbeat(job: ClaimedRagIndexJob, progress: RagJobProgress): Promise<void>

  abstract loadContent(documentIndexId: string): Promise<string>

  abstract savePlan(job: ClaimedRagIndexJob, plan: MarkdownPlan, vectors: number[][]): Promise<void>

  abstract complete(job: ClaimedRagIndexJob): Promise<void>

  abstract fail(
    job: ClaimedRagIndexJob,
    error: { errorCode: string; errorMessage: string; retryAt: Date | null; terminal: boolean },
  ): Promise<void>
}
