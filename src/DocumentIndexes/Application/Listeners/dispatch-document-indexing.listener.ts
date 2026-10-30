import { randomUUID } from 'node:crypto'

import { concatMap, every, firstValueFrom, from, lastValueFrom, range, takeWhile } from 'rxjs'

import type { ReserveDocumentForIndexingCommandHandlerContract } from '../../../Documents/Application/Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import type { ActivateKnowledgeBaseDocumentIndexCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/activate-knowledge-base-document-index.command.handler.contract.ts'
import type { GetIndexingKnowledgeBaseQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/get-indexing-knowledge-base.query.handler.contract.ts'
import type { ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/reserve-knowledge-base-document-for-indexing.command.handler.contract.ts'
import type { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import { DocumentIndexStatusEnum } from '../../Domain/Enums/document-index-status.enum.ts'
import { WriteClaimDocumentIndexesAssembler } from '../Assemblers/write-claim-document-indexes.assembler.ts'
import { WriteFailDocumentIndexesAssembler } from '../Assemblers/write-fail-document-indexes.assembler.ts'
import { WriteLifecycleDocumentIndexAssembler } from '../Assemblers/write-lifecycle-document-index.assembler.ts'
import { DOCUMENT_INDEXING_CLAIM_CANDIDATE_RESULT_KINDS } from '../DataTransferObjects/document-indexing-claim-candidate.dto.ts'
import type {
  DocumentIndexingClaimCandidateResultDTO,
  DocumentIndexingClaimExecutionDTO,
  DocumentIndexingClaimKnowledgeBaseDocumentDTO,
} from '../DataTransferObjects/document-indexing-claim-candidate.dto.ts'
import type { DocumentIndexingClaimDTO } from '../DataTransferObjects/document-indexing-claim.dto.ts'
import type { ExpiredDocumentIndexExecutionDTO } from '../DataTransferObjects/expired-document-index-execution.dto.ts'
import { DocumentIndexExecutionClaimConflictException } from '../Exceptions/document-index-execution-claim-conflict.exception.ts'
import { DocumentIndexingNotFoundException } from '../Exceptions/document-indexing-not-found.exception.ts'
import {
  DocumentIndexExecutionLifecycle,
  DOCUMENT_INDEX_EXECUTION_STATUS,
} from '../Helpers/document-index-execution-lifecycle.helper.ts'
import type { DocumentIndexExecutionQueue } from '../Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../Ports/Out/Gateways/document-index-failure.archive.ts'
import type { DocumentIndexSuccessArchive } from '../Ports/Out/Gateways/document-index-success.archive.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

const expiredLeaseErrorCode = 'INDEXING_LEASE_EXPIRED'
const retryableLeaseErrorMessage = 'Indexing worker lease expired'
const terminalLeaseErrorMessage = 'Indexing worker lease expired after the final attempt'

const DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS = {
  done: 'done',
  skip: DOCUMENT_INDEXING_CLAIM_CANDIDATE_RESULT_KINDS.skip,
  continue: 'continue',
  claimed: 'claimed',
} as const

type JobClaimAttempt =
  | { kind: typeof DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.done }
  | { kind: typeof DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.skip; documentIndexId: string }
  | { kind: typeof DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.continue }
  | { kind: typeof DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.claimed; job: DocumentIndexingClaimDTO }

/** Coordinates lease recovery and decides which eligible queued job should receive a lease. */
export class DispatchDocumentIndexingListener {
  constructor(
    private readonly transaction: PersistenceTransaction,
    private readonly reserveDocumentForIndexing: ReserveDocumentForIndexingCommandHandlerContract,
    private readonly reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
    private readonly workerLeaseSeconds: number,
    private readonly activateKnowledgeBaseDocumentIndex: ActivateKnowledgeBaseDocumentIndexCommandHandlerContract,
    private readonly getIndexingKnowledgeBase: GetIndexingKnowledgeBaseQueryHandlerContract,
    private readonly documentIndexSuccessArchive: DocumentIndexSuccessArchive,
  ) {}

  async handle(): Promise<DocumentIndexingClaimDTO | null> {
    const claimTimestamp = new Date()

    await this.transaction.run(async () => {
      const expiredJobRecords = await this.documentIndexExecutionQueue.findExpiredExecutions({
        now: claimTimestamp,
      })
      const expiredJobs = expiredJobRecords.map((jobRecord) =>
        WriteFailDocumentIndexesAssembler.toExpiredExecution(jobRecord),
      )
      const orderedExpiredJobs = [...expiredJobs].sort(compareRecoveryLockOrder)

      await lastValueFrom(
        from(orderedExpiredJobs).pipe(concatMap((expiredJob) => this.recoverExpiredJob(expiredJob))),
        { defaultValue: undefined },
      )
    })

    const excludedDocumentIndexIds: string[] = []
    const candidateCount = await this.transaction.run(() =>
      this.documentIndexExecutionQueue.countAvailableExecutions({ availableAt: claimTimestamp }),
    )
    const claimCandidate = async (): Promise<JobClaimAttempt> => {
      const nextAttempt = await this.claimNextCandidate(claimTimestamp, excludedDocumentIndexIds)

      if (nextAttempt.kind === DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.skip) {
        excludedDocumentIndexIds.push(nextAttempt.documentIndexId)
      }

      return nextAttempt
    }
    const canContinueClaiming = (attempt: JobClaimAttempt): boolean =>
      attempt.kind !== DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.done &&
      attempt.kind !== DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.claimed
    const finalClaimAttempt = await lastValueFrom(
      range(0, candidateCount).pipe(concatMap(claimCandidate), takeWhile(canContinueClaiming, true)),
      { defaultValue: { kind: DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.continue } as JobClaimAttempt },
    )

    return finalClaimAttempt.kind === DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.claimed ? finalClaimAttempt.job : null
  }

  private async recoverExpiredJob(expiredJobSnapshot: ExpiredDocumentIndexExecutionDTO): Promise<void> {
    if (
      !(await this.reserveDocumentForIndexing.execute({
        documentId: expiredJobSnapshot.documentId,
        skipLocked: true,
      }))
    )
      return

    const knowledgeBaseDocumentSourceQO = {
      knowledgeBaseId: expiredJobSnapshot.knowledgeBaseId,
      documentId: expiredJobSnapshot.documentId,
    }
    const knowledgeBaseDocumentReservation = await this.reserveKnowledgeBaseDocumentForIndexing.execute({
      ...knowledgeBaseDocumentSourceQO,
      skipLocked: true,
    })

    if (knowledgeBaseDocumentReservation !== null && !knowledgeBaseDocumentReservation.indexingReservationLockAcquired)
      return

    const recoveredAt = new Date()
    const expiredJobRecord = await this.documentIndexExecutionQueue.lockExpiredExecution({
      jobId: expiredJobSnapshot.id,
      now: recoveredAt,
    })

    if (!expiredJobRecord) return

    const expiredJob = WriteFailDocumentIndexesAssembler.toExpiredExecution(expiredJobRecord)

    const restoredExpiredDocumentIndexDTO = await this.documentIndexRepository.lockByDocumentIndexIdSkipLocked({
      documentIndexId: expiredJob.documentIndexId,
    })

    if (restoredExpiredDocumentIndexDTO === null) return

    const runningJobLifecycle = new DocumentIndexExecutionLifecycle({
      id: expiredJob.id,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
      attempts: expiredJob.attempts,
      leaseExpiresAt: expiredJob.leaseExpiresAt,
    })

    if (!runningJobLifecycle.isLeaseExpiredAt(recoveredAt)) return

    const failureDecision = runningJobLifecycle.afterFailure({
      errorMessage: retryableLeaseErrorMessage,
      terminalErrorMessage: terminalLeaseErrorMessage,
      failedAt: recoveredAt,
    })
    const failedExecutionState = WriteFailDocumentIndexesAssembler.toFailedExecutionState(
      expiredJob.executionState,
      expiredLeaseErrorCode,
      failureDecision.errorMessage,
      recoveredAt,
    )

    if (!failureDecision.terminal) {
      const jobRetryWrite = WriteFailDocumentIndexesAssembler.toDocumentIndexExecutionRetryWrite(
        DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
        failureDecision.retryAt,
        failedExecutionState,
      )
      const retryQueued = await this.documentIndexExecutionQueue.transitionExecution({
        jobId: expiredJob.id,
        expectedStatus: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
        ...jobRetryWrite,
      })

      if (!retryQueued) {
        throw new DocumentIndexExecutionClaimConflictException({ jobId: expiredJob.id, transition: 'expiredRetry' })
      }

      return
    }

    const saveFailedJobQO = WriteFailDocumentIndexesAssembler.toDocumentIndexFailureArchive(
      expiredJob,
      expiredLeaseErrorCode,
      failureDecision.errorMessage,
      failedExecutionState,
      recoveredAt,
    )
    await this.documentIndexFailureArchive.archive(saveFailedJobQO)
    const unreferencedDocumentIndex = restoredExpiredDocumentIndexDTO.markUnreferenced(recoveredAt)
    const expiredDocumentIndexRetentionQO =
      WriteLifecycleDocumentIndexAssembler.toSetDocumentIndexUnreferencedSinceQO(unreferencedDocumentIndex)

    await this.documentIndexRepository.updateByDocumentIndexIdWithUnreferencedSince(expiredDocumentIndexRetentionQO)
    await this.documentIndexExecutionQueue.releaseRunningExecution({ jobId: expiredJob.id })
  }

  private async lockByQueuedStatusAndAvailableAtOrBeforeAndDocumentIndexIdNotInOldestSkipLockedWithClaimCandidateResult(
    availableAt: Date,
    excludedDocumentIndexIds: readonly string[],
  ): Promise<DocumentIndexingClaimCandidateResultDTO> {
    const queuedJobSnapshot = await this.documentIndexExecutionQueue.findOldestAvailableExecution({
      availableAt,
      excludedDocumentIndexIds,
    })

    if (!queuedJobSnapshot) return null

    const skippedJobCandidate = {
      kind: DOCUMENT_INDEXING_CLAIM_CANDIDATE_RESULT_KINDS.skip,
      documentIndexId: queuedJobSnapshot.documentIndexId,
    }

    if (
      !(await this.reserveDocumentForIndexing.execute({
        documentId: queuedJobSnapshot.documentId,
        skipLocked: true,
      }))
    )
      return skippedJobCandidate

    const knowledgeBaseDocumentSourceQO = {
      knowledgeBaseId: queuedJobSnapshot.knowledgeBaseId,
      documentId: queuedJobSnapshot.documentId,
    }
    const knowledgeBaseDocumentReservation = await this.reserveKnowledgeBaseDocumentForIndexing.execute({
      ...knowledgeBaseDocumentSourceQO,
      skipLocked: true,
    })

    if (knowledgeBaseDocumentReservation !== null && !knowledgeBaseDocumentReservation.indexingReservationLockAcquired)
      return skippedJobCandidate

    const queuedJobRecord = await this.documentIndexExecutionQueue.lockAvailableExecution({
      jobId: queuedJobSnapshot.id,
      availableAt,
    })

    if (!queuedJobRecord) return skippedJobCandidate

    const claimJob = WriteClaimDocumentIndexesAssembler.toDocumentIndexingClaimExecution(queuedJobRecord)
    const claimKnowledgeBaseDocument = knowledgeBaseDocumentReservation
    const claimIndexes = await this.lockByDocumentIndexIdsSkipLockedWithClaimIndexMap(
      claimJob,
      claimKnowledgeBaseDocument,
    )

    if (!claimIndexes) return skippedJobCandidate

    const claimIndex = claimIndexes.get(claimJob.documentIndexId) ?? null
    const runningSiblingJobRecords = await this.documentIndexExecutionQueue.findSiblingExecutions({
      documentIndexId: claimJob.documentIndexId,
      jobId: claimJob.id,
    })
    const runningSiblingLeases = runningSiblingJobRecords.map((runningSiblingJobRecord) =>
      WriteClaimDocumentIndexesAssembler.toDocumentIndexExecutionSiblingLease(runningSiblingJobRecord),
    )
    const claimCandidate = WriteClaimDocumentIndexesAssembler.toDocumentIndexingClaimCandidate(
      claimJob,
      claimIndex,
      claimKnowledgeBaseDocument?.activeDocumentIndexId
        ? (claimIndexes.get(claimKnowledgeBaseDocument.activeDocumentIndexId) ?? null)
        : null,
      claimKnowledgeBaseDocument,
      runningSiblingLeases,
    )

    return { kind: DOCUMENT_INDEXING_CLAIM_CANDIDATE_RESULT_KINDS.candidate, candidate: claimCandidate }
  }

  private async lockByDocumentIndexIdsSkipLockedWithClaimIndexMap(
    claimJob: DocumentIndexingClaimExecutionDTO,
    claimKnowledgeBaseDocument: DocumentIndexingClaimKnowledgeBaseDocumentDTO | null,
  ): Promise<Map<string, DocumentIndex> | null> {
    const documentIndexIds = new Set([claimJob.documentIndexId])
    const previousDocumentIndexId = claimKnowledgeBaseDocument?.activeDocumentIndexId

    if (previousDocumentIndexId) documentIndexIds.add(previousDocumentIndexId)

    const orderedDocumentIndexIds = [...documentIndexIds].sort()
    const claimIndexes = new Map<string, DocumentIndex>()
    const lockClaimIndex = async (documentIndexId: string): Promise<boolean> => {
      const documentIndex = await this.documentIndexRepository.lockByDocumentIndexIdSkipLocked({ documentIndexId })

      if (documentIndex) {
        claimIndexes.set(documentIndexId, documentIndex)

        return true
      }

      return (await this.documentIndexRepository.findByDocumentIndexId({ documentIndexId })) === null
    }
    const allIndexesAvailable = await firstValueFrom(
      from(orderedDocumentIndexIds).pipe(
        concatMap(lockClaimIndex),
        every((indexAvailable) => indexAvailable),
      ),
    )

    return allIndexesAvailable ? claimIndexes : null
  }

  private async claimNextCandidate(
    claimTimestamp: Date,
    excludedDocumentIndexIds: readonly string[],
  ): Promise<JobClaimAttempt> {
    return this.transaction.run(async () => {
      const claimCandidateResult =
        await this.lockByQueuedStatusAndAvailableAtOrBeforeAndDocumentIndexIdNotInOldestSkipLockedWithClaimCandidateResult(
          claimTimestamp,
          excludedDocumentIndexIds,
        )

      if (!claimCandidateResult) return { kind: DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.done }

      if (claimCandidateResult.kind === DOCUMENT_INDEXING_CLAIM_CANDIDATE_RESULT_KINDS.skip) {
        return {
          kind: DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.skip,
          documentIndexId: claimCandidateResult.documentIndexId,
        }
      }

      const claimCandidate = claimCandidateResult.candidate
      const claimedAt = new Date()

      if (
        !claimCandidate.knowledgeBaseDocument ||
        claimCandidate.knowledgeBaseDocument.requestedGeneration !== claimCandidate.job.generation
      ) {
        await this.documentIndexExecutionQueue.releaseQueuedExecution({ jobId: claimCandidate.job.id })

        return { kind: DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.continue }
      }

      if (claimCandidate.documentIndex?.status === DocumentIndexStatusEnum.READY) {
        const previousDocumentIndexId = claimCandidate.knowledgeBaseDocument.activeDocumentIndexId
        const knowledgeBaseDocumentActivated = await this.activateKnowledgeBaseDocumentIndex.execute({
          knowledgeBaseId: claimCandidate.job.knowledgeBaseId,
          documentId: claimCandidate.job.documentId,
          generation: claimCandidate.job.generation,
          expectedActiveDocumentIndexId: previousDocumentIndexId,
          documentIndexId: claimCandidate.job.documentIndexId,
        })

        if (!knowledgeBaseDocumentActivated) {
          return {
            kind: DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.skip,
            documentIndexId: claimCandidate.job.documentIndexId,
          }
        }

        const referencedDocumentIndex = claimCandidate.documentIndex.markReferenced()
        const referencedDocumentIndexRetentionQO =
          WriteLifecycleDocumentIndexAssembler.toSetDocumentIndexUnreferencedSinceQO(referencedDocumentIndex)

        await this.documentIndexRepository.updateByDocumentIndexIdWithUnreferencedSince(
          referencedDocumentIndexRetentionQO,
        )

        if (
          previousDocumentIndexId &&
          previousDocumentIndexId !== claimCandidate.job.documentIndexId &&
          claimCandidate.previousDocumentIndex !== null
        ) {
          const unreferencedDocumentIndex = claimCandidate.previousDocumentIndex.markUnreferenced(claimedAt)
          const previousDocumentIndexRetentionQO =
            WriteLifecycleDocumentIndexAssembler.toSetDocumentIndexUnreferencedSinceQO(unreferencedDocumentIndex)

          await this.documentIndexRepository.updateByDocumentIndexIdWithUnreferencedSince(
            previousDocumentIndexRetentionQO,
          )
        }

        const knowledgeBase = await this.getIndexingKnowledgeBase.execute({
          knowledgeBaseId: claimCandidate.job.knowledgeBaseId,
        })

        if (knowledgeBase === null) throw new DocumentIndexingNotFoundException(claimCandidate.job.id)

        // Completion here is activation of an existing index, without provider execution by this job.
        await this.documentIndexSuccessArchive.archiveSuccess({
          projectId: knowledgeBase.projectId,
          jobId: claimCandidate.job.id,
          knowledgeBaseId: claimCandidate.job.knowledgeBaseId,
          documentId: claimCandidate.job.documentId,
          documentIndexId: claimCandidate.job.documentIndexId,
          generation: claimCandidate.job.generation,
          attempts: claimCandidate.job.attempts,
          executionVerification: null,
          completedAt: claimedAt,
        })

        const queuedJobRemoved = await this.documentIndexExecutionQueue.releaseQueuedExecution({
          jobId: claimCandidate.job.id,
        })

        if (!queuedJobRemoved) {
          throw new DocumentIndexExecutionClaimConflictException({
            jobId: claimCandidate.job.id,
            transition: 'readyActivation',
          })
        }

        return { kind: DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.continue }
      }

      if (claimCandidate.documentIndex?.status !== DocumentIndexStatusEnum.BUILDING) {
        await this.documentIndexExecutionQueue.releaseQueuedExecution({ jobId: claimCandidate.job.id })

        return { kind: DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.continue }
      }

      const hasActiveSibling = claimCandidate.runningSiblingLeases.some((siblingLease) =>
        new DocumentIndexExecutionLifecycle({
          id: siblingLease.id,
          status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
          attempts: siblingLease.attempts,
          leaseExpiresAt: siblingLease.leaseExpiresAt,
        }).hasActiveLeaseAt(claimedAt),
      )

      if (hasActiveSibling) {
        return { kind: DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.skip, documentIndexId: claimCandidate.job.documentIndexId }
      }

      const leaseToken = randomUUID()
      const queuedJobLifecycle = new DocumentIndexExecutionLifecycle({
        id: claimCandidate.job.id,
        status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
        attempts: claimCandidate.job.attempts,
        leaseExpiresAt: null,
      })
      const leaseExpiresAt = queuedJobLifecycle.leaseExpiryFrom(claimedAt, this.workerLeaseSeconds)

      const jobClaim = WriteClaimDocumentIndexesAssembler.toDocumentIndexingLeaseClaim(
        queuedJobLifecycle.nextClaimAttempts(),
        leaseToken,
        leaseExpiresAt,
        claimedAt,
      )
      const jobClaimStatusWrite = WriteClaimDocumentIndexesAssembler.toDocumentIndexExecutionClaimWrite(
        DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
        claimedAt,
        jobClaim,
      )
      const leaseClaimed = await this.documentIndexExecutionQueue.transitionExecution({
        jobId: claimCandidate.job.id,
        expectedStatus: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
        ...jobClaimStatusWrite,
      })

      if (!leaseClaimed) {
        throw new DocumentIndexExecutionClaimConflictException({
          jobId: claimCandidate.job.id,
          transition: 'leaseClaim',
        })
      }

      const claimedJob = WriteClaimDocumentIndexesAssembler.toDocumentIndexingClaim(claimCandidate.job, jobClaim)

      return { kind: DOCUMENT_INDEXING_CLAIM_ATTEMPT_KINDS.claimed, job: claimedJob }
    })
  }
}

const compareRecoveryLockOrder = (
  left: ExpiredDocumentIndexExecutionDTO,
  right: ExpiredDocumentIndexExecutionDTO,
): number =>
  left.documentId.localeCompare(right.documentId) ||
  left.knowledgeBaseId.localeCompare(right.knowledgeBaseId) ||
  left.id.localeCompare(right.id)
