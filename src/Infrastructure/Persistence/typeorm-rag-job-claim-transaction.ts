import type { EntityManager } from 'typeorm'

import { RagJobFactory } from './Factories/rag-job.factory.js'
import type { RagDocumentIndexModel } from './Models/rag-document-index.model.js'
import type { TypeOrmRagDocumentIndexRepository } from './Repositories/typeorm-rag-document-index.repository.js'
import type { TypeOrmRagDocumentRepository } from './Repositories/typeorm-rag-document.repository.js'
import type { TypeOrmRagFailedJobRepository } from './Repositories/typeorm-rag-failed-job.repository.js'
import type { TypeOrmRagJobClaimRepository } from './Repositories/typeorm-rag-job-claim.repository.js'
import type { TypeOrmRagMembershipRepository } from './Repositories/typeorm-rag-membership.repository.js'
import {
  RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS,
  type ClaimedRagIndexJobContract,
  type ExpiredRagJob,
  type RagFailedJobArchive,
  type RagJobClaim,
  type RagJobClaimCandidateResult,
  type RagJobClaimTransaction,
  type RagMembershipActivation,
} from '../../Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'

/** Coordinates lock acquisition and maps facts; Application selects and sequences transitions. */
export class TypeOrmRagJobClaimTransaction implements RagJobClaimTransaction {
  constructor(
    private readonly manager: EntityManager,
    private readonly jobs: TypeOrmRagJobClaimRepository,
    private readonly documents: TypeOrmRagDocumentRepository,
    private readonly memberships: TypeOrmRagMembershipRepository,
    private readonly indexes: TypeOrmRagDocumentIndexRepository,
    private readonly failedJobs: TypeOrmRagFailedJobRepository,
  ) {}

  async lockExpiredJobs(now: Date): Promise<ReadonlyArray<ExpiredRagJob>> {
    const snapshots = await this.jobs.findExpiredSnapshotsIn(this.manager, now)

    return snapshots.reduce(async (previousLocks, snapshot) => {
      const lockedJobs = await previousLocks
      const document = await this.documents.lockAvailableByIdIn(this.manager, snapshot.documentId)

      if (!document) return lockedJobs

      const membership = await this.memberships.lockAvailableMembershipIn(
        this.manager,
        snapshot.knowledgeBaseId,
        snapshot.documentId,
      )

      if (!membership && (await this.memberships.existsIn(this.manager, snapshot.knowledgeBaseId, snapshot.documentId)))
        return lockedJobs

      const job = await this.jobs.lockExpiredIn(this.manager, snapshot.id, now)

      if (!job) return lockedJobs

      const index = await this.indexes.lockAvailableByIdIn(this.manager, job.documentIndexId)

      if (!index) return lockedJobs

      lockedJobs.push(RagJobFactory.toExpiredLeaseFact(job, RagJobFactory.toRunningDomain(job).leaseExpiresAt))

      return lockedJobs
    }, Promise.resolve<ExpiredRagJob[]>([]))
  }

  async retryExpiredJob(jobId: string, retryAt: Date, executionState: Record<string, unknown>): Promise<void> {
    await this.jobs.retryExpiredIn(this.manager, jobId, retryAt, executionState)
  }

  async archiveExpiredJob(archive: RagFailedJobArchive): Promise<void> {
    await this.failedJobs.createAndSaveMany(this.manager, [archive])
  }

  async removeExpiredJob(jobId: string): Promise<void> {
    await this.jobs.removeExpiredIn(this.manager, jobId)
  }

  async countQueuedCandidates(availableAt: Date): Promise<number> {
    return this.jobs.countQueuedCandidatesIn(this.manager, availableAt)
  }

  async findNextCandidate(
    availableAt: Date,
    excludedDocumentIndexIds: ReadonlyArray<string>,
  ): Promise<RagJobClaimCandidateResult> {
    const snapshot = await this.jobs.findQueuedSnapshotIn(this.manager, availableAt, excludedDocumentIndexIds)

    if (!snapshot) return null

    const skip = { kind: RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS.skip, documentIndexId: snapshot.documentIndexId }
    const document = await this.documents.lockAvailableByIdIn(this.manager, snapshot.documentId)

    if (!document) return skip

    const membership = await this.memberships.lockAvailableMembershipIn(
      this.manager,
      snapshot.knowledgeBaseId,
      snapshot.documentId,
    )

    if (!membership && (await this.memberships.existsIn(this.manager, snapshot.knowledgeBaseId, snapshot.documentId)))
      return skip

    const job = await this.jobs.lockQueuedIn(this.manager, snapshot.id, availableAt)

    if (!job) return skip

    const previousIndexId = membership?.activeDocumentIndexId ?? null
    const indexIds = [...new Set([job.documentIndexId, ...(previousIndexId ? [previousIndexId] : [])])].sort()
    const indexLocks = await indexIds.reduce(
      async (previousLocks, documentIndexId) => {
        const result = await previousLocks

        if (result.skipped) return result

        const index = await this.indexes.lockAvailableByIdIn(this.manager, documentIndexId)

        if (index) result.indexes.set(documentIndexId, index)
        else if (await this.indexes.existsByIdIn(this.manager, documentIndexId)) result.skipped = true

        return result
      },
      Promise.resolve({ indexes: new Map<string, RagDocumentIndexModel>(), skipped: false }),
    )

    if (indexLocks.skipped) return skip

    const index = indexLocks.indexes.get(job.documentIndexId)
    const runningSiblings = await this.jobs.findRunningSiblingsIn(this.manager, job.documentIndexId, job.id)

    return {
      kind: RAG_JOB_CLAIM_CANDIDATE_RESULT_KINDS.candidate,
      candidate: {
        job: {
          id: job.id,
          knowledgeBaseId: job.knowledgeBaseId,
          documentId: job.documentId,
          documentIndexId: job.documentIndexId,
          generation: job.generation,
          attempts: job.attempts,
        },
        indexStatus: index?.status ?? null,
        membership: membership
          ? {
              requestedGeneration: membership.requestedGeneration,
              activeDocumentIndexId: membership.activeDocumentIndexId,
            }
          : null,
        runningSiblingLeases: runningSiblings.map((sibling) => ({
          id: sibling.id,
          attempts: sibling.attempts,
          leaseExpiresAt: RagJobFactory.toRunningDomain(sibling).leaseExpiresAt,
        })),
      },
    }
  }

  async discardQueuedJob(jobId: string): Promise<boolean> {
    return this.jobs.discardQueuedIn(this.manager, jobId)
  }

  async setMembershipActiveIndex(activation: RagMembershipActivation): Promise<boolean> {
    return this.memberships.setActiveIndexIfCurrentIn(this.manager, activation)
  }

  async markIndexReferenced(documentIndexId: string): Promise<void> {
    await this.indexes.setUnreferencedSince(this.manager, documentIndexId, null)
  }

  async markIndexUnreferenced(documentIndexId: string, unreferencedSince: Date): Promise<void> {
    await this.indexes.setUnreferencedSince(this.manager, documentIndexId, unreferencedSince)
  }

  async claimQueuedJob(jobId: string, claimedAt: Date, claim: RagJobClaim): Promise<ClaimedRagIndexJobContract> {
    const job = await this.jobs.claimQueuedIn(this.manager, jobId, claimedAt, claim)

    return {
      id: job.id,
      knowledgeBaseId: job.knowledgeBaseId,
      documentId: job.documentId,
      documentIndexId: job.documentIndexId,
      generation: job.generation,
      attempts: job.attempts,
      leaseToken: claim.leaseToken,
      leaseExpiresAt: claim.leaseExpiresAt,
      executionVerification: claim.executionVerification,
    }
  }
}
