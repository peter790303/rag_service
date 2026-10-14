import type { ClaimedRagIndexJobContract } from './rag-job-claim-transaction.js'
import type { ExpiredRagJob, RagFailedJobArchive } from './rag-job-claim-transaction.js'
import type { RagExecutionStageEnum } from '../../../Domain/Knowledge/Enums/rag-execution-stage.enum.js'

export interface RagJobFailureTransaction {
  lockDocument(documentId: string): Promise<boolean>
  lockMembership(knowledgeBaseId: string, documentId: string): Promise<{ requestedGeneration: number } | null>
  lockClaimedJob(job: ClaimedRagIndexJobContract, now: Date): Promise<ExpiredRagJob>
  lockIndex(documentIndexId: string): Promise<boolean>
  queueRetry(jobId: string, availableAt: Date, executionState: Record<string, unknown>): Promise<void>
  archiveFailedJob(archive: RagFailedJobArchive): Promise<void>
  markIndexUnreferenced(documentIndexId: string, at: Date): Promise<void>
  removeClaimedJob(jobId: string): Promise<void>
}

export abstract class RagJobFailureStore {
  abstract withFailureTransaction<T>(operation: (transaction: RagJobFailureTransaction) => Promise<T>): Promise<T>
}

export type RagJobProgressContract = {
  stage: RagExecutionStageEnum
  completedUnits: number
  totalUnits: number | null
}

/** Persistence boundary for a claimed indexing job's transactional state changes. */
export abstract class RagIndexProcessingRepository {
  abstract heartbeat(
    job: ClaimedRagIndexJobContract,
    progress: RagJobProgressContract,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<void>

  abstract loadContent(documentIndexId: string): Promise<string>
}
