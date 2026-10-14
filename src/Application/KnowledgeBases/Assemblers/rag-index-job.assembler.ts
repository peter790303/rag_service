import type { ClaimedRagIndexJobContract } from '../Contracts/rag-job-claim-transaction.js'
import type { ClaimedRagIndexJob } from '../DataTransferObjects/rag-index-job.dto.js'

/** Maps a persisted claim contract to the worker DTO. */
export class RagIndexJobAssembler {
  static toClaimed(job: ClaimedRagIndexJobContract): ClaimedRagIndexJob {
    return {
      id: job.id,
      knowledgeBaseId: job.knowledgeBaseId,
      documentId: job.documentId,
      documentIndexId: job.documentIndexId,
      generation: job.generation,
      attempts: job.attempts,
      leaseToken: job.leaseToken,
      leaseExpiresAt: job.leaseExpiresAt,
      executionVerification: {
        stage: job.executionVerification.stage,
        completedUnits: job.executionVerification.completedUnits,
        totalUnits: job.executionVerification.totalUnits,
        verifiedAt: job.executionVerification.verifiedAt,
        ...(job.executionVerification.claimToken !== undefined
          ? { claimToken: job.executionVerification.claimToken }
          : {}),
        ...(job.executionVerification.leaseExpiresAt !== undefined
          ? { leaseExpiresAt: job.executionVerification.leaseExpiresAt }
          : {}),
      },
    }
  }
}
