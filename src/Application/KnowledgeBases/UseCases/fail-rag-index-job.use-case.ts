import { InvalidRagJobLeaseException } from '../../../Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import { RagJob, RAG_JOB_STATUS } from '../../../Domain/Knowledge/rag-job.js'
import type { RagJobFailureStore } from '../Contracts/rag-indexing-repository.js'
import type { ClaimedRagIndexJobContract } from '../Contracts/rag-job-claim-transaction.js'
import type { RagJobFailureDecision } from '../Contracts/rag-job-management.js'

/** Applies a claimed worker's retry or archive outcome in one fenced transaction. */
export class FailRagIndexJobUseCase {
  constructor(private readonly failureStore: RagJobFailureStore) {}

  async execute(job: ClaimedRagIndexJobContract, decision: RagJobFailureDecision): Promise<void> {
    await this.failureStore.withFailureTransaction(async (transaction) => {
      const documentExists = await transaction.lockDocument(job.documentId)
      const membership = await transaction.lockMembership(job.knowledgeBaseId, job.documentId)

      if (!documentExists || membership?.requestedGeneration !== Number(job.generation)) {
        throw new InvalidRagJobLeaseException()
      }

      const record = await transaction.lockClaimedJob(job, new Date())

      if (!(await transaction.lockIndex(job.documentIndexId))) throw new InvalidRagJobLeaseException()

      const executionState = {
        ...(record.executionState ?? {}),
        lastError: {
          code: decision.errorCode,
          message: decision.errorMessage,
          failedAt: decision.failedAt.toISOString(),
        },
      }

      const failureTransition = new RagJob({
        id: record.id,
        status: RAG_JOB_STATUS.RUNNING,
        attempts: record.attempts,
        leaseExpiresAt: record.leaseExpiresAt,
      }).afterFailure({ errorMessage: decision.errorMessage, failedAt: decision.failedAt })

      if (decision.retryAt !== null && !failureTransition.terminal) {
        await transaction.queueRetry(record.id, decision.retryAt, executionState)

        return
      }

      await transaction.archiveFailedJob({
        jobId: record.id,
        knowledgeBaseId: record.knowledgeBaseId,
        documentId: record.documentId,
        documentIndexId: record.documentIndexId,
        generation: record.generation,
        attempts: record.attempts,
        errorCode: decision.errorCode,
        errorMessage: decision.errorMessage,
        blockedReasons: [],
        retryPayload: { format: 'rag-v1', input: record.payload, executionState },
        failedAt: decision.failedAt,
        retriedAt: null,
      })
      await transaction.markIndexUnreferenced(record.documentIndexId, decision.failedAt)
      await transaction.removeClaimedJob(record.id)
    })
  }
}
