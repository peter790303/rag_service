import { RAG_DOCUMENT_INDEX_STATUS } from '../../../Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagExecutionStageEnum } from '../../../Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { RagJob, RAG_JOB_STATUS } from '../../../Domain/Knowledge/rag-job.js'
import { RagIndexJobAssembler } from '../Assemblers/rag-index-job.assembler.js'
import type { RagCryptographyProvider } from '../Contracts/rag-cryptography-provider.js'
import {
  EXPIRED_RAG_JOB_TRANSITION_KINDS,
  RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS,
} from '../Contracts/rag-job-claim-transaction.js'
import type {
  ExpiredRagJobTransition,
  RagFailedJobArchive,
  RagJobClaim,
  RagJobClaimTransaction,
} from '../Contracts/rag-job-claim-transaction.js'
import type { RagJobClaimTransactionBoundary } from '../Contracts/rag-job-claim-transaction.js'
import type { ClaimedRagIndexJob } from '../DataTransferObjects/rag-index-job.dto.js'

const expiredLeaseErrorCode = 'INDEXING_LEASE_EXPIRED'
const retryableLeaseErrorMessage = 'Indexing worker lease expired'
const terminalLeaseErrorMessage = 'Indexing worker lease expired after the final attempt'

const RAG_JOB_CLAIM_ATTEMPT_KINDS = {
  done: 'done',
  skip: RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS.skip,
  continue: 'continue',
  claimed: 'claimed',
} as const

type RagJobClaimAttempt =
  | { kind: typeof RAG_JOB_CLAIM_ATTEMPT_KINDS.done }
  | { kind: typeof RAG_JOB_CLAIM_ATTEMPT_KINDS.skip; documentIndexId: string }
  | { kind: typeof RAG_JOB_CLAIM_ATTEMPT_KINDS.continue }
  | { kind: typeof RAG_JOB_CLAIM_ATTEMPT_KINDS.claimed; job: ClaimedRagIndexJob }

/** Coordinates lease recovery and decides which eligible queued job should receive a lease. */
export class ClaimNextRagJobUseCase {
  constructor(
    private readonly claimBoundary: RagJobClaimTransactionBoundary,
    private readonly cryptography: RagCryptographyProvider,
    private readonly workerLeaseSeconds: number,
  ) {}

  async execute(): Promise<ClaimedRagIndexJob | null> {
    const claimTimestamp = new Date()

    await this.claimBoundary.withClaimTransaction(async (transaction) => {
      const jobs = await transaction.lockExpiredJobs(claimTimestamp)
      const transitions = jobs
        .filter((job) =>
          new RagJob({
            id: job.id,
            status: RAG_JOB_STATUS.RUNNING,
            attempts: job.attempts,
            leaseExpiresAt: job.leaseExpiresAt,
          }).isLeaseExpiredAt(claimTimestamp),
        )
        .map((job): ExpiredRagJobTransition => {
          const decision = new RagJob({
            id: job.id,
            status: RAG_JOB_STATUS.RUNNING,
            attempts: job.attempts,
            leaseExpiresAt: job.leaseExpiresAt,
          }).afterFailure({
            errorMessage: retryableLeaseErrorMessage,
            terminalErrorMessage: terminalLeaseErrorMessage,
            failedAt: claimTimestamp,
          })
          const lastError = {
            code: expiredLeaseErrorCode,
            message: decision.errorMessage,
            failedAt: claimTimestamp.toISOString(),
          }
          const executionState = { ...(job.executionState ?? {}), lastError }

          if (!decision.terminal) {
            return {
              kind: EXPIRED_RAG_JOB_TRANSITION_KINDS.retry,
              jobId: job.id,
              retryAt: decision.retryAt,
              executionState,
            }
          }

          const archive: RagFailedJobArchive = {
            jobId: job.id,
            knowledgeBaseId: job.knowledgeBaseId,
            documentId: job.documentId,
            documentIndexId: job.documentIndexId,
            generation: job.generation,
            attempts: job.attempts,
            errorCode: expiredLeaseErrorCode,
            errorMessage: decision.errorMessage,
            blockedReasons: [],
            retryPayload: { format: 'rag-v1', input: job.payload, executionState },
            failedAt: claimTimestamp,
            retriedAt: null,
          }

          return {
            kind: EXPIRED_RAG_JOB_TRANSITION_KINDS.archive,
            jobId: job.id,
            archive,
            indexUnreferencedSince: claimTimestamp,
          }
        })

      await transitions.reduce(async (previousTransition, transition) => {
        await previousTransition
        await this.applyExpiredTransition(transaction, transition)
      }, Promise.resolve())
    })

    const excludedDocumentIndexIds: string[] = []
    const candidateCount = await this.claimBoundary.withClaimTransaction((transaction) =>
      transaction.countQueuedCandidates(claimTimestamp),
    )
    const candidateScanSlots = Array.from({ length: candidateCount }, () => undefined)
    const result = await candidateScanSlots.reduce(
      async (previousAttempt) => {
        const attempt = await previousAttempt

        if (attempt.kind === RAG_JOB_CLAIM_ATTEMPT_KINDS.done || attempt.kind === RAG_JOB_CLAIM_ATTEMPT_KINDS.claimed) {
          return attempt
        }

        const nextAttempt = await this.claimNextCandidate(claimTimestamp, excludedDocumentIndexIds)

        if (nextAttempt.kind === RAG_JOB_CLAIM_ATTEMPT_KINDS.skip) {
          excludedDocumentIndexIds.push(nextAttempt.documentIndexId)
        }

        return nextAttempt
      },
      Promise.resolve<RagJobClaimAttempt>({ kind: RAG_JOB_CLAIM_ATTEMPT_KINDS.continue }),
    )

    return result.kind === RAG_JOB_CLAIM_ATTEMPT_KINDS.claimed ? result.job : null
  }

  private async applyExpiredTransition(
    transaction: RagJobClaimTransaction,
    transition: ExpiredRagJobTransition,
  ): Promise<void> {
    if (transition.kind === EXPIRED_RAG_JOB_TRANSITION_KINDS.retry) {
      await transaction.retryExpiredJob(transition.jobId, transition.retryAt, transition.executionState)

      return
    }

    await transaction.archiveExpiredJob(transition.archive)
    await transaction.markIndexUnreferenced(transition.archive.documentIndexId, transition.indexUnreferencedSince)
    await transaction.removeExpiredJob(transition.jobId)
  }

  private async claimNextCandidate(
    claimTimestamp: Date,
    excludedDocumentIndexIds: ReadonlyArray<string>,
  ): Promise<RagJobClaimAttempt> {
    return this.claimBoundary.withClaimTransaction(async (transaction) => {
      const result = await transaction.findNextCandidate(claimTimestamp, excludedDocumentIndexIds)

      if (!result) return { kind: RAG_JOB_CLAIM_ATTEMPT_KINDS.done }

      if (result.kind === RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS.skip) {
        return { kind: RAG_JOB_CLAIM_ATTEMPT_KINDS.skip, documentIndexId: result.documentIndexId }
      }

      const candidate = result.candidate

      if (!candidate.membership || candidate.membership.requestedGeneration !== candidate.job.generation) {
        await transaction.discardQueuedJob(candidate.job.id)

        return { kind: RAG_JOB_CLAIM_ATTEMPT_KINDS.continue }
      }

      if (candidate.indexStatus === RAG_DOCUMENT_INDEX_STATUS.READY) {
        const previousIndexId = candidate.membership.activeDocumentIndexId
        const activated = await transaction.setMembershipActiveIndex({
          knowledgeBaseId: candidate.job.knowledgeBaseId,
          documentId: candidate.job.documentId,
          requestedGeneration: candidate.job.generation,
          expectedActiveDocumentIndexId: previousIndexId,
          documentIndexId: candidate.job.documentIndexId,
        })

        if (!activated) {
          return { kind: RAG_JOB_CLAIM_ATTEMPT_KINDS.skip, documentIndexId: candidate.job.documentIndexId }
        }

        await transaction.markIndexReferenced(candidate.job.documentIndexId)

        if (previousIndexId && previousIndexId !== candidate.job.documentIndexId) {
          await transaction.markIndexUnreferenced(previousIndexId, claimTimestamp)
        }

        const removed = await transaction.discardQueuedJob(candidate.job.id)

        if (!removed) throw new Error(`Ready RAG job ${candidate.job.id} changed while its index was activated`)

        return { kind: RAG_JOB_CLAIM_ATTEMPT_KINDS.continue }
      }

      if (candidate.indexStatus !== RAG_DOCUMENT_INDEX_STATUS.BUILDING) {
        await transaction.discardQueuedJob(candidate.job.id)

        return { kind: RAG_JOB_CLAIM_ATTEMPT_KINDS.continue }
      }

      const hasActiveSibling = candidate.runningSiblingLeases.some((sibling) =>
        new RagJob({
          id: sibling.id,
          status: RAG_JOB_STATUS.RUNNING,
          attempts: sibling.attempts,
          leaseExpiresAt: sibling.leaseExpiresAt,
        }).hasActiveLeaseAt(claimTimestamp),
      )

      if (hasActiveSibling) {
        return { kind: RAG_JOB_CLAIM_ATTEMPT_KINDS.skip, documentIndexId: candidate.job.documentIndexId }
      }

      const leaseToken = this.cryptography.generateLeaseToken()
      const queuedJob = new RagJob({
        id: candidate.job.id,
        status: RAG_JOB_STATUS.QUEUED,
        attempts: candidate.job.attempts,
        leaseExpiresAt: null,
      })
      const leaseExpiresAt = queuedJob.leaseExpiryFrom(claimTimestamp, this.workerLeaseSeconds)

      const claim: RagJobClaim = {
        attempts: queuedJob.nextClaimAttempts(),
        leaseToken,
        leaseExpiresAt,
        executionVerification: {
          stage: RagExecutionStageEnum.CLAIMED,
          completedUnits: 0,
          totalUnits: null,
          verifiedAt: claimTimestamp.toISOString(),
          claimToken: leaseToken,
          leaseExpiresAt: leaseExpiresAt.toISOString(),
        },
      }

      const claimedJob = RagIndexJobAssembler.toClaimed(
        await transaction.claimQueuedJob(candidate.job.id, claimTimestamp, claim),
      )

      return { kind: RAG_JOB_CLAIM_ATTEMPT_KINDS.claimed, job: claimedJob }
    })
  }
}
